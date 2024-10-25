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
    readJsonFile,
    writeJsonFile,
    validate_port,
    validate_token,
}					from './utils.js';
import config_subprogram_init		from './config.js';
import publish_subprogram_init		from './publish.js';
import install_subprogram_init		from './install.js';
import uninstall_subprogram_init	from './uninstall.js';
import zomes_subprogram_init		from './zomes.js';
import orgs_subprogram_init		from './orgs.js';
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
            if ( connected === true ) {
                try {
                    await project.connect();
                } catch (err) {
                    output              = chalk.red(err.message);
                    return;
                }
            }

            try {
	        // Ensure action results are used as the program output
	        output			= await action_callback.call( this, {
		    log,
                    project,
	        }, ...args );
            } finally {
                if ( project?.client )
                    await project.client.close();
            }
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
        // TODO: make a global option to use a data output format.  When present, command failures
        // should throw an error instead of just printing a red message.  It could also default to
        // true when main is called programatically.
        //
        .option("-d, --data", "Display in a data format", false )
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

	    if ( opts.data )
		opts.quiet              = true;

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

                return {
                    "cell_agent":   project?.cell_agent,
                    "client_agent": project?.client_agent,
                };
	    })
        );

    program
	.command("status")
	.description("Display the known contexts and settings")
	.action(
	    action_context(async function ({
		log,
                project,
	    }) {
	        const opts              = this.opts();
	        const root_opts         = program.opts();

		if ( !project.config )
                    return chalk.white(`Devhub has not been initiated`);

                let whoami : any        = null;

                try {
                    await project.connect();
                    whoami              = await project.zomehub_client.whoami();
                    await project.client.close();
                } catch (err) {
                    whoami              = err;
                }

                if ( root_opts.data ) {
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
                    `Project CWD: ${chalk.magenta(project.cwd)}`,
                    ``,
                    `You are`,
                    whoami instanceof Error
                        ? (
                            project.connectionState === "CONNECTED"
                                ? `  Cell Agent:   ${chalk.red("Client agent needs capabilities granted")}`
                                : `  Cell Agent:   ${chalk.red("Connection settings failed. See 'devhub connection status' for more info")}`
                        )
                        : `  Cell Agent:   ${chalk.yellow(whoami?.pubkey?.latest)}`,
                    `  Client Agent: ${chalk.yellow(project.client_agent)}`,
                    ``,
                    `Project assets`,
                    ...(zome_configs.length
                        ? [
                            `  Zomes:`,
                            ...Object.entries( project.config.zomes ).map( ([tid, zome_config]) => {
                                return `    ${chalk.white(tid)} - ${chalk.cyan(zome_config.name)}\n`
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
                        "cell_agent":       project.cell_agent,
                        "client_agent":     project.client_agent,
                        "source":           project.connection_src,
                        "networks":         project.app_client
                            ? {
                                "zomehub":      project.app_client.getRoleDnaHash( "zomehub" ),
                            }
                            : null,
                    };
                } catch (err) {
                    // console.error(err);

                    return {
                        "state":            project.connectionState,
                        "error":            err.message,
                        "connection":       project.connection,
                        "cell_agent":       project.cell_agent,
                        "client_agent":     project.client_agent,
                        "source":           project.connection_src,
                        "networks":         project.app_client
                            ? {
                                "zomehub":      project.app_client.getRoleDnaHash( "zomehub" ),
                            }
                            : null,
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
	.argument("<token>", "Devhub auth token (hex or base64)")
	.option("-f, --force", "Create config even if the file already exists", false )
	.action(
	    action_context(async function ({
		log,
                project,
	    }, app_port, app_token ) {
		const opts              = this.opts();
		const conn_opts	        = this.parent.opts();

		if ( project.connection && opts.force !== true ) {
                    // Prevent writing to the global config if...
                    if ( conn_opts.global ) {
                        // ...it already exists
                        if ( project.isGlobalConnectionConfig() ) {
		            throw new Error(`Cannot overwrite existing global connection config; use --force to override this error`);
                        }
                        // ...there is a local config defined
                        else {
		            throw new Error(`Cannot write to global connection config while a local connection config exists; use --force to override this error`);
                        }
                    }
                    // Prevent writing to the local config if it already exists
                    else if ( !project.isGlobalConnectionConfig() )
		        throw new Error(`Connection config is already set @ ${project.connectionFilepath}`);
                }

                const parsed_b64        = Buffer.from( app_token, "base64" );

                if ( parsed_b64.length === 64 )
                    app_token           = parsed_b64.toString("hex");

                validate_token( app_token );

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

                const connection : any  = { ...project.connection };

                // Default to global config if it exists and a local config does not exist
                if ( project.isGlobalConnectionConfig() === true ) {
		    log.info(`Default to updating global config: global=%s`, conn_opts.global );
                    conn_opts.global    = true;
                }

		switch ( config_prop ) {
		    case "app_port":
                        validate_port( value );

			connection.app_port		= parseInt( value );
			break;
		    case "app_token":
                        // Check token type
                        const parsed_b64        = Buffer.from( value, "base64" );

                        if ( parsed_b64.length === 64 )
                            value               = parsed_b64.toString("hex");

                        validate_token( value );

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

    program
	.command("agents")
	.description("List all agents")
	.action(
	    action_context(async function ({
		log,
                project,
	    }) {
                return await project.zomehub_client.list_all_agents();
	    })
        );


    initialize_subcommand( config_subprogram_init );
    initialize_subcommand( publish_subprogram_init );
    initialize_subcommand( install_subprogram_init );
    initialize_subcommand( uninstall_subprogram_init );
    initialize_subcommand( zomes_subprogram_init );
    initialize_subcommand( orgs_subprogram_init );

    try {
        await program.parseAsync( argv );
    } catch (err) {
        if ( program.opts().data )
            throw err;
        output                          = chalk.red( String(err) );
    }
    // At this point all subcommand actions have completed

    // console.log("Remaining args:", program.args );
    // console.log("Remaining args:", program.opts() );

    return output;
}

if ( typeof process?.mainModule?.filename !== "string" ) {
    try {
	const output			= await main( process.argv );
        // Turn quiet off for final output
        print.quiet                     = false;

        if ( typeof output === "string" )
            console.log( output );
	else if ( !["", undefined].includes(output) ) {
	    if ( process.stdout.isTTY )
		print( json.debug(output) );
	    else
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
