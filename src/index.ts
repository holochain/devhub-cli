import { Logger }			from '@whi/weblogger';
const log				= new Logger("devhub-cli", "fatal" );

import fs				from 'fs/promises';
import path				from 'path';

import json				from '@whi/json';
import { Command }			from 'commander';
import {
    AppInterfaceClient,
}					from '@spartan-hc/app-interface-client';
import {
    ZomeHubCell,
}					from '@holochain/zomehub-zomelets';

import {
    print,
}					from './utils.js';
import zomes_subprogram_init		from './zomes.js';


//
// Utils
//
function increaseTotal ( v, total ) {
    return total + 1;
}


//
// Constants
//
const __dirname				= path.dirname( new URL( import.meta.url ).pathname );
const ROOT_DIR				= path.resolve( __dirname, ".." );
const PACKAGE_DETAILS			= JSON.parse(
    await fs.readFile(
	path.resolve( ROOT_DIR, "package.json" ),
	"utf-8",
    )
);

// Program name derived from package.json
export const NAME			= PACKAGE_DETAILS.name;
// Program version derived from package.json
export const VERSION			= PACKAGE_DETAILS.version;



//
// Main
//
export async function main ( argv ) {
    const program			= new Command();

    // Global 'quiet' flag for runtime
    let quiet				= false;
    // Global 'verbosity' level for runtime
    let verbosity			= 0;

    let client, app_client;
    let zomehub, zomehub_csr;
    let project_config;
    let output;

    function action_context ( action_callback ) {
	return async function ( ...args ) {
	    // Ensure action results are used as the program output
	    output			= await action_callback.call( this, {
		log,
		client,
		app_client,
		zomehub,
		zomehub_csr,
		project_config,
	    }, ...args );
	};
    }

    function initialize_subcommand ( subprogram_init ) {
	subprogram_init( program, action_context )
    }

    program
	.name( NAME )
	.version( VERSION )
	.configureHelp({
	    "showGlobalOptions": true,
	})
	.option("-v, --verbose", "increase logging verbosity", increaseTotal, 0 )
	.option("-q, --quiet", "suppress all printing except for final result", false )
	.option("-p, --app-port <port>", "set the app port for connecting to the Holochain Conductor", parseInt )
	.option("-a, --app-name <name>", "set the installed app ID as the context for commands" )
	.option("-c, --config <config>", "" )
	.option("-t, --timeout <timeout>", "set timeout for Holochain start-up (default 60 seconds)", parseInt )
	.hook("preAction", async function (self) {
	    const opts			= self.opts();

	    // Don't allow -q and -v
	    if ( opts.quiet && opts.verbose > 0 )
		throw new Error(`Don't use both --quite and --verbose in the same command; which one do you want?`);

	    // Only set the verbosity if a -v is present but start at 2 levels above
	    if ( opts.verbose > 0 ) {
		// Allow other 'program' functions to access the verbosity setting
		verbosity		= opts.verbose + 2
		// Verbosity setting controls logger level
		log.setLevel( verbosity );
		log.info(`Set logger verbosity to: %s (%s)`, verbosity, log.level_name );
	    }

	    if ( opts.quiet ) {
		// Allow other 'program' functions to access the quiet setting
		quiet			= true;
		// Tell print() to block writes
		print.quiet		= true;
		// Set logger to fatal even though it should still be set at that level
		log.setLevel( 0 );
	    }

	    if ( opts.config ) {
		const config_json	= await fs.readFile( opts.config, "utf8" );
		project_config		= JSON.parse( config_json );
		log.info("Project config: %s", json.debug(project_config) );
	    }

	    // Setup the clients that all subcommands would use
	    client			= new AppInterfaceClient( opts.appPort, {
		"logging": "fatal",
	    });

	    app_client			= await client.app( opts.appName );

	    ({
		zomehub,
	    }				= app_client.createInterface({
		"zomehub":		ZomeHubCell,
	    }));

	    zomehub_csr			= zomehub.zomes.zomehub_csr.functions;
	})
	// Control commander's output/error write behavior
	.configureOutput({
	    writeOut ( str ) {
		// Don't show commander messages if the the quiet flag was set
		if ( !quiet )
		    process.stdout.write( str );
	    },
	    writeErr ( str ) {
		// Don't show commander error messages if the logging is set to fatal
		if ( verbosity > 0 )
		    process.stdout.write(`\x1b[31m${str}\x1b[0m`);
	    },
	    outputError ( str, write ) {
		write(`\x1b[31m${str}\x1b[0m`);
	    },
	})
	// Prevent process exiting
	.exitOverride()
	// Force failure when unknown arguments are provided
	.allowExcessArguments( false );

    initialize_subcommand( zomes_subprogram_init );

    await program.parseAsync( argv );
    // At this point all subcommand actions have completed

    return output;
}


if ( typeof process?.mainModule?.filename !== "string" ) {
    try {
	const output			= await main( process.argv );

	if ( output !== "" )
	    print( json.debug(output) );
    } catch (err) {
	if ( !err.message.includes("outputHelp") )
	    throw err;
    }
}


//
// Exports
//
export default {
    VERSION,
    main,
};
