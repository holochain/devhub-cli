
import fs				from 'fs/promises';
import path				from 'path';

import json				from '@whi/json';
import inquirer				from 'inquirer';
import {
    Argument,
    Option,
}					from 'commander';
import {
    print,
    parseHex,
    buildList,

    validate_port,
    validate_token,

    is_valid_port,
    is_valid_token,
}					from './utils.js';

import {
    TARGET_TYPES,
    ZOME_TYPES,
}					from './types.js';


export default function ({ program, action_context, auto_help }) {
    const subprogram			= program
	.command("config")
	.description("Manage devhub config")
	.action( auto_help );

    subprogram
	.command("show")
	.description("Print current devhub info")
	.option("-r, --raw", "Show raw config file" )
	.action(
	    action_context(async function ({
		log,
		devhub_config,
		devhub_settings,
	    }) {
		const opts		= this.opts();

		if ( !devhub_config )
		    throw new Error(`There is no devhub context (ie. ./devhub.json)`);

		return opts.raw ? devhub_config : devhub_settings;
	    }, false )
	);

    subprogram
	.command("init")
	.description("Create devhub config")
	.option("-f, --force", "Create config even if the file already exists" )
	.action(
	    action_context(async function ({
		log,
		devhub_config,
		devhub_settings,
	    }) {
		const root_opts		= program.opts();
		const opts		= this.opts();

		const config_path	= path.resolve( root_opts.config );


		// Check if this would overrite an existing devhub config
		if ( devhub_config && opts.force !== true )
		    throw new Error(`There is already a devhub config (${config_path})`);


		// Set defaults based on option input
		const defaults		= {} as any;

		if ( devhub_settings.app_port )
		    defaults.app_port		= devhub_settings.app_port;

		if ( devhub_settings.app_token )
		    defaults.app_token		= Buffer.from(
			devhub_settings.app_token
		    ).toString("hex");


		// Check if connection input is valid
		if ( defaults.app_port && !is_valid_port( defaults.app_port ) ) {
		    log.error("Invalid app port provided via options: %s", defaults.app_port );
		    delete defaults.app_port;
		}

		if ( defaults.app_token && !is_valid_token( defaults.app_token ) ) {
		    log.error("Invalid app token provided via options: %s", defaults.app_token );
		    delete defaults.app_token;
		}


		// Get remaining information
		const prompt		= inquirer.createPromptModule();
		const config		= await prompt([
		    {
			"name":		"app_port",
			"message":	"What is the port for connecting to Holochain's app interface?",
			validate ( port ) {
			    try {
				return validate_port( port );
			    } catch (err) {
				return err.message;
			    }
			},
			filter ( input ) {
			    if ( is_valid_port( input ) )
				return parseInt( input );

			    return input;
			},
		    },
		    {
			"name":		"app_token",
			"message":	"What is the auth token for connecting to Holochain's app interface?",
			validate ( token ) {
			    try {
				return validate_token( token );
			    } catch (err) {
				return err.message;
			    }
			},
		    },
		], defaults );

		// config.zomes		= {};
		// config.dnas		= {};
		// config.happs		= {};
		// config.webhapps		= {};

		log.normal("Writing devhub config to %s", config_path );
		await fs.writeFile(
		    config_path,
		    JSON.stringify( config, null, 4 ) + "\n",
		    "utf8",
		);

		return config;
	    }, false )
	);

    const update_subprogram		= subprogram
	.command("update")
	.description("Update devhub config")
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
		devhub_config,
		devhub_config_path,
	    }, config_prop, value ) {
		const opts		= this.opts();

		if ( !devhub_config )
		    throw new Error(`Devhub config '${devhub_config_path}' does not exist`);

		switch ( config_prop ) {
		    case "app_port":
			devhub_config.app_port		= parseInt( value );
			break;
		    case "app_token":
			// TODO: check token type
			devhub_config.app_token		= value;
			break;
		    default:
			throw new TypeError(`Unhandled config property '${config_prop}'`);
			break;
		}

		log.normal("Writing updated devhub config to %s", devhub_config_path );
		await fs.writeFile(
		    devhub_config_path,
		    JSON.stringify( devhub_config, null, 4 ) + "\n",
		    "utf8",
		);

		return devhub_config;
	    }, false )
	);

    subprogram
	.command("add")
	.description("Add inline zome config")
	.addArgument(
	    new Argument("<type>", "Config (target) type")
		.choices( TARGET_TYPES )
	)
	.argument("<target-id>", "Zome target identifier" )
	.argument("<path>", "Path to the zome target")
	.option("-f, --force", "Add target even if the file doesn't exist yet" )
	.action(
	    action_context(async function ({
		log,
		devhub_config_path,
	    }, target_type, target_id, target_config_path ) {
		const opts		= this.opts();

		const config		= JSON.parse(
		    await fs.readFile( devhub_config_path, "utf8" )
		);
		const tconfig_abs_path	= path.resolve( target_config_path );

		if ( config?.zomes?.[ target_id ] && opts.force === false )
		    throw new Error(`There is already a zome target named '${target_id}'`);

		try {
		    await fs.access( tconfig_abs_path );
		} catch (err) {
		    if ( err.code === "ENOENT" )
			throw new Error(`Zome target config '${tconfig_abs_path}' does not exist`);
		    else
			throw err;
		}

		if ( !config.zomes )
		    config.zomes		= {};

		config.zomes[ target_id ]	= path.relative(
		    path.dirname( devhub_config_path ),
		    tconfig_abs_path
		);

		log.normal("Writing updated devhub config to %s", devhub_config_path );
		await fs.writeFile(
		    devhub_config_path,
		    JSON.stringify( config, null, 4 ) + "\n",
		    "utf8",
		);

		return config;
	    })
	);

    const zomes_subprogram		= subprogram
	.command("zomes")
	.description("Manage config zomes")
	.action( auto_help );

    zomes_subprogram
	.command("add")
	.description("Add inline zome config")
	.argument("<target-id>", "Zome target identifier" )
	.option("-w, --target-path <path>", "path to the zome target (default: \"\")" )
	.addOption(
	    new Option("-T, --zome-type <path>", "zome type (default: \"integrity\")")
		.choices( ZOME_TYPES )
	)
	.option("-n, --package-name <string>", "zome package name (default: \"\")" )
	.option("-d, --package-description <string>", "zome package description (default: \"\")" )
	.option("-x, --package-version <string>", "zome package version (default: \"0.1.0\")" )
	.option("-m, --package-maintainer <hash>", "zome package maintainer (default: \"null\")" )
	.option("-l, --package-tags <string>", "zome package tag (default: \"[]\")", buildList )
	.option("-y, --yes", "use defaults for all prompts" )
	.option("-f, --force", "Overwrite zome target if the target ID already exists" )
	.action(
	    action_context(async function ({
		log,
		devhub_config_path,
	    }, target_id ) {
		const opts		= this.opts();

		const config		= JSON.parse(
		    await fs.readFile( devhub_config_path, "utf8" )
		);

		const target_path	= opts.targetPath;
		const target_abs_path	= path.resolve( target_path );

		if ( config?.zomes?.[ target_id ] && opts.force === false )
		    throw new Error(`There is already a zome target named '${target_id}'`);


		const basename		= path.basename( devhub_config_path );
		const default_name	= path.extname( basename ) === ""
		    ? basename
		    : basename.slice( 0, -path.extname( basename ).length );

		const zome_config	= {
		    "type":		"zome",
		    "version":		opts.packageVersion ?? (
			opts.yes ? "0.1.0" : undefined
		    ),
		    "target":		target_path ?? (
			opts.yes ? "" : undefined
		    ),
		    "name":		opts.packageName ?? (
			opts.yes ? default_name : undefined
		    ),
		    "description":	opts.packageDescription ?? (
			opts.yes ? "" : undefined
		    ),
		    "zome_type":	opts.zomeType ?? (
			opts.yes ? "integrity" : undefined
		    ),
		    "maintainer":	opts.packageMaintainer ?? null,
		    "tags":		opts.packageTags ?? (
			opts.yes ? [] : undefined
		    ),
		    "metadata":		{},
		};

		if ( target_path ) {
		    const target_abs_path	= path.resolve( target_path );
		    zome_config.target		= path.relative(
			path.dirname( devhub_config_path ),
			target_abs_path
		    );
		}

		// Get remaining information
		const prompt		= inquirer.createPromptModule();
		const answers		= await prompt([
		    {
			"type":		"list",
			"name":		"zome_type",
			"message":	"Zome type?",
			"choices":	ZOME_TYPES,
			"default":	"integrity",
		    },
		    {
			"name":		"target",
			"message":	"Zome package target file path?",
			"default":	"",
		    },
		    {
			"name":		"name",
			"message":	"Zome package name?",
			"default":	"",
		    },
		    {
			"name":		"description",
			"message":	"Zome package description?",
			"default":	"",
		    },
		    {
			"name":		"version",
			"message":	"Zome package version?",
			"default":	"0.1.0",
		    },
		    {
			"name":		"tags",
			"message":	"Zome package tags?",
			"default":	"",
			filter ( input ) {
			    if ( input.trim().length > 0 )
				return input.split(",");
			    else
				return [];
			},
		    },
		], zome_config );

		Object.assign( zome_config, answers );

		if ( !config.zomes )
		    config.zomes		= {};

		config.zomes[ target_id ]	= zome_config;

		log.normal("Writing updated devhub config to %s", devhub_config_path );
		await fs.writeFile(
		    devhub_config_path,
		    JSON.stringify( config, null, 4 ) + "\n",
		    "utf8",
		);

		return config;
	    }, false )
	);

    zomes_subprogram
	.command("init")
	.description("Create zome config")
	.option("-O, --output-file <path>", "new zome config location (default: \"devhub-zome.json\")" )
	.option("-w, --target-path <path>", "path to the zome target (default: \"\")" )
	.addOption(
	    new Option("-T, --zome-type <path>", "zome type (default: \"integrity\")")
		.choices( ZOME_TYPES )
	)
	.option("-n, --package-name <string>", "zome package name (default: \"\")" )
	.option("-d, --package-description <string>", "zome package description (default: \"\")" )
	.option("-x, --package-version <string>", "zome package version (default: \"0.1.0\")" )
	.option("-m, --package-maintainer <hash>", "zome package maintainer (default: \"null\")" )
	.option("-l, --package-tags <string>", "zome package tag (default: \"[]\")", buildList )
	.option("-y, --yes", "use defaults for all prompts" )
	.option("-f, --force", "Create config even if the file already exists" )
	.action(
	    action_context(async function ({
		log,
	    }, package_version ) {
		const opts		= this.opts();

		const target_path	= opts.targetPath;
		const output_abs_path	= path.resolve( opts.outputFile ?? "devhub-zome.json" );

		try {
		    await fs.access( output_abs_path );

		    if ( opts.force === false )
			throw new Error(`There is already a zome config @ '${output_abs_path}'`);
		} catch (err) {
		    if ( err.code !== "ENOENT" )
			throw err;
		}

		const basename		= path.basename( opts.outputFile ?? "" );
		const default_name	= path.extname( basename ) === ""
		    ? basename
		    : basename.slice( 0, -path.extname( basename ).length );

		const config		= {
		    "type":		"zome",
		    "version":		opts.packageVersion ?? (
			opts.yes ? "0.1.0" : undefined
		    ),
		    "target":		target_path ?? (
			opts.yes ? "" : undefined
		    ),
		    "name":		opts.packageName ?? (
			opts.yes ? default_name : undefined
		    ),
		    "description":	opts.packageDescription ?? (
			opts.yes ? "" : undefined
		    ),
		    "zome_type":	opts.zomeType ?? (
			opts.yes ? "integrity" : undefined
		    ),
		    "maintainer":	opts.packageMaintainer ?? null,
		    "tags":		opts.packageTags ?? (
			opts.yes ? [] : undefined
		    ),
		    "metadata":		{},
		};

		if ( target_path ) {
		    const target_abs_path	= path.resolve( target_path );
		    config.target		= path.relative(
			path.dirname(output_abs_path),
			target_abs_path
		    );
		}

		// Get remaining information
		const prompt		= inquirer.createPromptModule();
		const answers		= await prompt([
		    {
			"type":		"list",
			"name":		"zome_type",
			"message":	"Zome type?",
			"choices":	ZOME_TYPES,
			"default":	"integrity",
		    },
		    {
			"name":		"target",
			"message":	"Zome package target file path?",
			"default":	"",
		    },
		    {
			"name":		"name",
			"message":	"Zome package name?",
			"default":	"",
		    },
		    {
			"name":		"description",
			"message":	"Zome package description?",
			"default":	"",
		    },
		    {
			"name":		"version",
			"message":	"Zome package version?",
			"default":	"0.1.0",
		    },
		    {
			"name":		"tags",
			"message":	"Zome package tags?",
			"default":	"",
			filter ( input ) {
			    if ( input.trim().length > 0 )
				return input.split(",");
			    else
				return [];
			},
		    },
		], config );

		Object.assign( config, answers );

		log.normal("Writing new zome config to %s", output_abs_path );
		await fs.writeFile(
		    output_abs_path,
		    JSON.stringify( config, null, 4 ) + "\n",
		    "utf8",
		);

		return config;
	    }, false )
	);

    return program;
}
