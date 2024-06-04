#!/usr/bin/env node
// -*- mode: typescript -*-
import { Logger }			from '@whi/weblogger';
const log				= new Logger("devhub-cli", "fatal" );

import fs				from 'fs/promises';
import path				from 'path';

import cloneDeep			from 'clone-deep';
import json				from '@whi/json';
import {
    Command,
    Option,
}					from 'commander';
import {
    ActionHash,
}					from '@spartan-hc/holo-hash';
import {
    AppInterfaceClient,
}					from '@spartan-hc/app-interface-client';
import {
    ZomeHubCell,
}					from '@holochain/zomehub-zomelets';

import {
    ConnectionContext,
    DevhubConfig,
    DevhubSettings,

    ActionContextFunction,
    ActionCallbackFunction,
    SubprogramInitFunction,
}					from './types.js';
import {
    print,
    parseHex,
    readJsonFile,
}					from './utils.js';
import config_subprogram_init		from './config.js';
import publish_subprogram_init		from './publish.js';
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
const PACKAGE_DETAILS			= await readJsonFile(
    path.resolve( ROOT_DIR, "package.json" )
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
    let mere_memory_api;
    let connection_ctx : ConnectionContext;
    let devhub_config_path : string;
    let devhub_config : DevhubConfig;
    let devhub_settings : DevhubSettings	= {
	"app_port":	undefined,
	"app_token":	undefined,
	"zomes":	{},
    };
    let output;

    async function connect () {
	const opts			= program.opts();

	if ( !connection_ctx.app_port )
	    throw new TypeError(`Missing app port`);

	if ( !connection_ctx.app_token )
	    throw new TypeError(`Missing app token`);

	// Setup the clients that all subcommands would use
	if ( !client ) {
	    client			= new AppInterfaceClient( connection_ctx.app_port, {
		"logging":	"fatal",
		"conn_options": {
		    "timeout":	opts.timeout,
		},
	    });
	}

	if ( !app_client ) {
	    app_client			= await client.app( connection_ctx.app_token );
	}

	if ( !zomehub ) {
	    ({
		zomehub,
	    }				= app_client.createInterface({
		"zomehub":		ZomeHubCell,
	    }));
	}

	if ( !zomehub_csr ) {
	    zomehub_csr			= zomehub.zomes.zomehub_csr.functions;
	}

	if ( !mere_memory_api ) {
	    mere_memory_api		= zomehub.zomes.mere_memory_api.functions;
	}
    }

    function action_context (
	action_callback		: ActionCallbackFunction,
	connected		: boolean = true,
    ) {
	return async function ( ...args ) {
	    if ( connected === true )
		await connect();

	    // Ensure action results are used as the program output
	    output			= await action_callback.call( this, {
		log,

		connection_ctx,
		devhub_config_path,
		devhub_config,
		devhub_settings,

		client,
		app_client,
		zomehub,
		zomehub_csr,
		mere_memory_api,
	    }, ...args );
	};
    }

    async function auto_help () {
	if ( client )
	    await client.conn.open();
	this.outputHelp();
    }

    function initialize_subcommand (
	subprogram_init		: SubprogramInitFunction,
    ) {
	subprogram_init({ program, action_context, auto_help, devhub_config });
    }


    // States
    //   - blank: ready for connection to be defined
    //   - connected: ready for project to be defined
    //   - defined: project context is set

    // If there is no project context yet...
    //   - Connections are not possible
    //   - The type of project is not known (eg. zome, dna, happ)

    // If there is a project config...
    //   - Connections are possible
    //   - The type of project is known

    // If there is a project config and option overrides...
    //   - Connections are made using the option overrides
    //   - The type of project is known
    program
	.name( NAME )
	.version( VERSION )
	.configureHelp({
	    "showGlobalOptions": true,
	})
	.option("-v, --verbose", "increase logging verbosity (default: \"fatal\")", increaseTotal, 0 )
	.option("-q, --quiet", "suppress all printing except for final result", false )
	.option("-p, --app-port <port>", "set the app port for connecting to the Holochain Conductor", parseInt )
	.option("-a, --app-token <token>", "set the auth token used to setup the app context for commands", parseHex )
	.option("-c, --config <config>", "path to project config file", "devhub.json" )
	.addOption(
	    (new Option(
		"-t, --timeout <number>",
		"set the default timeout for app calls",
	    ))
		.argParser( parseInt )
		.default( 60_000, "60s" )
	)
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

	    // Is there a project config?
	    try {
		devhub_config_path	= path.resolve( opts.config );
		log.info("Using devhub config file path: %s", devhub_config_path );
		devhub_config		= await readJsonFile( devhub_config_path );

		log.trace("Devhub config: %s", json.debug(devhub_config) );

		// Copy devhub config to devhub settings
		Object.assign( devhub_settings, {
		    ...cloneDeep( devhub_config ),
		    "app_token":	parseHex( devhub_config.app_token ),
		});
	    } catch (err) {
		if ( err.code !==  "ENOENT" )
		    throw err;
	    }

	    // Override the devhub settings if connection opts are set
	    if ( opts.appPort )
		devhub_settings.app_port	= opts.appPort;
	    if ( opts.appToken )
		devhub_settings.app_token	= opts.appToken;

	    // Are the connection details set?  This would only be undefined if there are no devhub
	    // settings and no connection options.
	    if ( devhub_settings.app_port && devhub_settings.app_token ) {
		connection_ctx			= {
		    "app_port":		devhub_settings.app_port,
		    "app_token":	devhub_settings.app_token,
		};
	    }

	    for ( let target_id in devhub_settings.zomes ) {
		const zome_ref		= devhub_settings.zomes[ target_id ];

		if ( typeof zome_ref === "string" ) {
		    const zome_config	= await readJsonFile( zome_ref );

		    // Update the relative target reference to be relative to the devhub.json location
		    zome_config.target	= path.relative(
			path.dirname(devhub_config_path),
			// Combine zome ref path and target path
			path.resolve(
			    path.dirname(zome_ref),
			    zome_config.target
			)
		    );

		    devhub_settings.zomes[ target_id ] = zome_config;
		}

		const zome_config	= devhub_settings.zomes[ target_id ];

		if ( zome_config.zome_package_id )
		    zome_config.zome_package_id		= new ActionHash( zome_config.zome_package_id );

		if ( zome_config.zome_package_version_id )
		    zome_config.zome_package_version_id	= new ActionHash( zome_config.zome_package_version_id );
	    }

	    log.trace("Devhub settings: %s", json.debug(devhub_settings) );
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
	.allowExcessArguments( false )
	.action( auto_help );

    initialize_subcommand( config_subprogram_init );
    initialize_subcommand( publish_subprogram_init );
    initialize_subcommand( zomes_subprogram_init );

    await program.parseAsync( argv );
    // At this point all subcommand actions have completed

    try {
	return output;
    } finally {
	if ( client )
	    await client.close();
    }
}

if ( typeof process?.mainModule?.filename !== "string" ) {
    try {
	const output			= await main( process.argv );

	if ( !["", undefined].includes(output) ) {
	    if ( process.stdout.isTTY )
		print( json.debug(output) );
	    else if ( !print.quiet )
		console.log( JSON.stringify(output, null, 4) );
	}
    } catch (err) {
	if ( err.code?.startsWith("commander") ) {
	    if ( !(
		err.code.includes("helpDisplayed")
		|| err.code.includes("version")
	    ))
		console.log(`\x1b[31m${err.message}\x1b[0m`);
	}
	else
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
