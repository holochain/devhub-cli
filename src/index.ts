#!/usr/bin/env node
// -*- mode: typescript -*-
import { Logger }			from '@whi/weblogger';
const log				= new Logger("devhub-cli", "fatal" );

import fs				from 'fs/promises';
import path				from 'path';

import chalk				from 'chalk';
import cloneDeep			from 'clone-deep';
import json				from '@whi/json';
import {
    Command,
    Argument,
    Option,
}					from 'commander';
import {
    ActionHash,
}					from '@spartan-hc/holo-hash';

import {
    ActionContextFunction,
    ActionCallbackFunction,
    SubprogramInitFunction,
}					from './types.js';
import {
    print,
    parseHex,
    readJsonFile,
    writeJsonFile,
}					from './utils.js';
import config_subprogram_init		from './config.js';
import publish_subprogram_init		from './publish.js';
import install_subprogram_init		from './install.js';
import zomes_subprogram_init		from './zomes.js';
import {
    Project,
}                                       from './utils/project.js';


//
// Utils
//
function increaseTotal ( v, total ) {
    return total + 1;
}


//
// Constants
//
const CWD_DIR				= process.cwd();
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

    let project : Project;
    let output;

    function action_context (
	action_callback		: ActionCallbackFunction,
	connected		: boolean = true,
    ) {
	return async function ( ...args ) {
            if ( connected === true )
                await project.connect();

	    // Ensure action results are used as the program output
	    output			= await action_callback.call( this, {
		log,
                project,
	    }, ...args );

            if ( project?.client )
                await project.client.close();
	};
    }

    async function auto_help () {
	// if ( client )
	//     await client.conn.open();
	this.outputHelp();
    }

    function initialize_subcommand (
	subprogram_init		: SubprogramInitFunction,
    ) {
	subprogram_init({ program, action_context, auto_help });
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
	.option("--cwd <path>", "path to project dir", CWD_DIR )
	.option("--user-homedir <path>", "path to project dir")
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

	    // Is there a project config?  Most commands won't work if it hasn't been initiated
            project                     = await Project.create( opts.cwd );
	    log.trace("Devhub settings: %s", json.debug({
                "connection":   project.connection,
                "config":       project.config,
            }) );
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
	.allowExcessArguments( true )
	.allowUnknownOption( true )
	.action( auto_help );

    program
	.command("init")
	.allowExcessArguments( true )
	.allowUnknownOption( true )
	.description("Initialize a devhub project")
	.option("-f, --force", "Create config even if the file already exists", false )
	.action(
	    action_context(async function ({
		log,
                project,
	    }) {
	        const opts              = this.opts();

		if ( project.config && opts.force !== true )
		    throw new Error(`There is already a devhub config (${project.configFilepath})`);

                log.normal("Writing devhub config to %s", project.configFilepath );
                await project.init();
	    }, false )
        );

    program
	.command("whoami")
	.description("Devhub cell agent pubkey")
	.action(
	    action_context(async function ({
		log,
                project,
	    }) {
	        const opts              = this.opts();

		if ( !project.connection )
		    throw new Error(`No connection config`);

                return String(project.app_client.agent_id);
	    })
        );

    program
	.command("status")
	.description("Display the known contexts and settings")
	.option("-d, --data", "Display in a data format", false )
	.action(
	    action_context(async function ({
		log,
                project,
	    }) {
	        const opts              = this.opts();

		if ( !project.config )
                    return chalk.white(`Devhub has not been initiated`);

                let whoami : any        = null;

                try {
                    await project.connect();
                    whoami              = await project.zomehub_client.whoami();
                    await project.client.close();
                } catch (err) {
                    whoami              = {
                        "name":     err.name,
                        "message":  err.message,
                    };
                }

                if ( opts.data ) {
                    return {
                        whoami,
                        project,
                    };
                }

                // Display ideas:
                //   - What stage of publishing each package is in
                //   - Untracked WASM files (that are not yet assigned to a package)
                //   - Details about currently installed dependencies (count, size, ...)
                const zome_configs      = Object.entries( project.config.zomes );
                return [
                    `You are agent ${chalk.yellow(whoami.pubkey.latest)}`,
                    `Project CWD: ${chalk.magenta(project.cwd)}`,
                    ``,
                    `Project assets`,
                    ...(zome_configs.length
                        ? [
                            `  Zomes:`,
                            ...Object.entries( project.config.zomes ).map( ([tid, zome_config]) => {
                                return `    ${chalk.cyan(zome_config.name)}\n`
                                    +  `      ${zome_config.title} - ${chalk.gray(zome_config.description)}`;
                            }),
                        ]
                        : [`  No defined zomes`]
                       ),
                ].join("\n");
	    }, false )
        );

    const conn_program                  = program
	.command("connection")
	.description("Manage connection to Conductor")
        .option("-g, --global", "Define connection settings globally", false )
	.action( auto_help );

    conn_program
	.command("status")
	.description("Display connection status")
	.action(
	    action_context(async function ({
		log,
                project,
	    }) {
                try {
                    await project.connect();

                    return {
                        "state":            project.connectionState,
                        "connection":       project.connection,
                    };
                } catch (err) {
                    // console.error(err);

                    return {
                        "state":            project.connectionState,
                        "connection":       project.connection,
                    };
                } finally {
                    if ( project?.client )
                        await project.client.close();
                }
            }, false )
        );

    conn_program
	.command("set")
	.description("Set devhub connection settings")
	.argument("<port>", "Conductor app port", parseInt )
	.argument("<token>", "Devhub auth token")
	.option("-f, --force", "Create config even if the file already exists", false )
	.action(
	    action_context(async function ({
		log,
                project,
	    }, app_port, app_token ) {
		const opts              = this.opts();
		const conn_opts	        = this.parent.opts();

		if ( project.connection && opts.force !== true )
		    throw new Error(`Connection config is already set @ ${project.connectionFilepath}`);

                const connection        = {
                    app_port,
                    app_token,
                };

                await project.setConnection( connection, {
                    "global":       conn_opts.global,
                });

		return project.connection;
            }, false )
        );

    conn_program
	.command("update")
	.description("Update devhub connection settings")
	.addArgument(
	    new Argument("<property>", "Config property")
		.choices([
		    "app_port",
		    "app_token",
		])
	)
	.argument("<value>", "Property new value")
	.action(
	    action_context(async function ({
		log,
                project,
	    }, config_prop, value ) {
		const opts		= this.opts();
		const conn_opts	        = this.parent.opts();

		if ( !project.config )
		    throw new Error(`Devhub config does not exist`);

                const connection : any  = { ...project.connection };

                // // Check if connection input is valid
                // if ( defaults.app_port && !is_valid_port( defaults.app_port ) ) {
                //     log.error("Invalid app port provided via options: %s", defaults.app_port );
                //     delete defaults.app_port;
                // }

                // if ( defaults.app_token && !is_valid_token( defaults.app_token ) ) {
                //     log.error("Invalid app token provided via options: %s", defaults.app_token );
                //     delete defaults.app_token;
                // }

		switch ( config_prop ) {
		    case "app_port":
			connection.app_port		= parseInt( value );
			break;
		    case "app_token":
			// TODO: check token type
			connection.app_token		= value;
			break;
		    default:
			throw new TypeError(`Unhandled config property '${config_prop}'`);
			break;
		}

                await project.setConnection( connection, {
                    "global":       conn_opts.global,
                });

		return project.connection;
	    }, false )
	);


    initialize_subcommand( config_subprogram_init );
    initialize_subcommand( publish_subprogram_init );
    initialize_subcommand( install_subprogram_init );
    initialize_subcommand( zomes_subprogram_init );

    await program.parseAsync( argv );
    // At this point all subcommand actions have completed

    // console.log("Remaining args:", program.args );
    // console.log("Remaining args:", program.opts() );

    try {
	return output;
    } finally {
	// if ( client )
	//     await client.close();
    }
}

if ( typeof process?.mainModule?.filename !== "string" ) {
    try {
	const output			= await main( process.argv );

        if ( typeof output === "string" )
            console.log( output );
	else if ( !["", undefined].includes(output) ) {
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
export * as utils                       from './utils.js';
export default {
    VERSION,
    main,
};
