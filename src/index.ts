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

export const NAME			= PACKAGE_DETAILS.name;
export const VERSION			= PACKAGE_DETAILS.version;


//
// Main
//
export async function main ( argv ) {
    const program			= new Command();

    let client, app_client;
    let zomehub, zomehub_csr;
    let output;

    function action_context ( action_callback ) {
	return async function ( ...args ) {
	    output			= await action_callback.call( this, {
		client,
		app_client,
		zomehub,
		zomehub_csr,
	    }, ...args );
	};
    }

    program
	.name( NAME )
	.version( VERSION )
	.option("-v, --verbose", "increase logging verbosity", increaseTotal, 0 )
	.option("-q, --quiet", "suppress all printing except for final result", false )
	.option("-p, --app-port <port>", "set the app port for connecting to the Holochain Conductor", parseInt )
	.option("-a, --app-name <name>", "set the installed app ID as the context for commands" )
	.option("-t, --timeout <timeout>", "set timeout for Holochain start-up (default 60 seconds)", parseInt )
	.hook("preAction", async function (self) {
	    const opts		= self.opts();

	    // Don't allow -q and -v
	    if ( opts.quiet && opts.verbose > 0 )
		throw new Error(`Don't use both --quite and --verbose in the same command; which one do you want?`);

	    // Only set the verbosity if a -v is present but start at 2 levels above
	    if ( opts.verbose > 0 ) {
		log.setLevel( opts.verbose + 2 );
		log.info(`Set logger verbosity to: %s`, opts.verbose + 2 );
	    }

	    if ( opts.quiet ) {
		print.quiet		= true;
		log.setLevel( 0 );
	    }

	    log.trace("Parsing argv: %s", argv );

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
	.allowExcessArguments( false );

    zomes_subprogram_init( program, action_context );

    await program.parseAsync( argv );
    // At this point all subcommand actions have completed

    return output;
}


if ( typeof process?.mainModule?.filename !== "string" ) {
    const output			= await main( process.argv );

    print( json.debug(output) );
}


//
// Exports
//
export default {
    VERSION,
    main,
};
