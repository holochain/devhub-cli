
import fs				from 'fs/promises';
import path				from 'path';

import toml				from 'toml';
import chalk				from 'chalk';
import inquirer				from 'inquirer';
import semver				from 'semver';
import {
    Argument,
    Option,
}					from 'commander';
import json				from '@whi/json';

import { main }                         from './index.js';
import {
    ZomeTarget,
    SubprogramInitInput,
    SubprogramInitFunction,
    ZOME_TYPES,
}					from './types.js';
import {
    buildList,

    readJsonFile,
    writeJsonFile,

    snakeToWords,
}					from './utils.js';


const init : SubprogramInitFunction = async function (
    {
	program,
	action_context,
	auto_help,
	devhub_config
    } : SubprogramInitInput,
) {
    const subprogram			= program
	.command("zomes").alias("zome")
	.description("Manage zomes")
	.action( auto_help );

    subprogram
        .command("init")
        .description("Create zome config")
        .option(`-w, --target-path <path>`, `path to the zome target (default: "")` )
        .addOption(
            new Option(`-T, --zome-type <type>`, `zome type (default: "integrity")`)
                .choices( ZOME_TYPES )
        )
        .option(`-i, --package-name <string>`, `zome package name (default: "")` )
        .option(`-n, --package-title <string>`, `zome package title (default: "")` )
        .option(`-d, --package-description <string>`, `zome package description (default: "")` )
        .option(`-x, --package-version <string>`, `zome package version (default: "0.1.0")` )
        .option(`-m, --package-maintainer <hash>`, `zome package maintainer (default: "null")` )
        .option(`-l, --package-tags <string>`, `zome package tag (default: "[]")`, buildList )
        .option(`-y, --yes`, `use defaults for all prompts` )
        .option(`-f, --force`, `create config even if the file already exists` )
        .argument("[location]", "Zome config location")
        .action(
            action_context(async function ({
                log,
                project,
            }, output_dir ) {
                const opts              = this.opts();

                const output_abs_path   = path.resolve(
                    output_dir || project.cwd,
                    "zome.json"
                );

                let cargo_settings : any = {};
                try {
                    const toml_text     = await fs.readFile(
                        path.resolve(
                            path.dirname(output_abs_path),
                            "Cargo.toml",
                        ),
                        "utf8",
                    );
                    const toml_data     = toml.parse( toml_text );

                    Object.assign(
                        cargo_settings,
                        toml_data,
                    );
                } catch (err) {
                    log.info("No Cargo.toml to read defaults from; %s", err.message );
                }

                try {
                    await fs.access( output_abs_path );

                    if ( opts.force === false )
                        throw new Error(`There is already a zome config @ '${output_abs_path}'`);
                } catch (err) {
                    if ( err.code !== "ENOENT" )
                        throw err;
                }

                const config            = {
                    "type":                "zome",
                    "version":          opts.packageVersion ?? (
                        opts.yes ? "0.1.0" : undefined
                    ),
                    "target":           opts.targetPath ?? (
                        opts.yes ? "" : undefined
                    ),
                    "name":             opts.packageName ?? (
                        opts.yes ? (cargo_settings.package?.name || "") : undefined
                    ),
                    "title":            opts.packageTitle ?? (
                        opts.yes ? "" : undefined
                    ),
                    "description":      opts.packageDescription ?? (
                        opts.yes ? "" : undefined
                    ),
                    "zome_type":        opts.zomeType ?? (
                        opts.yes ? "integrity" : undefined
                    ),
                    "maintainer":       opts.packageMaintainer ?? null,
                    "tags":             opts.packageTags ?? (
                        opts.yes ? [] : undefined
                    ),
                    "metadata":         {},
                };

                // Get remaining information
                log.info("Cargo defaults:", cargo_settings );
                const prompt            = inquirer.createPromptModule();
                const answers           = await prompt([
                    {
                        "type":         "list",
                        "name":         "zome_type",
                        "message":      "Zome type?",
                        "choices":      ZOME_TYPES,
                        "default":      "integrity",
                    },
                    {
                        "name":         "target",
                        "message":      "Zome package target file path?",
                        "default":      "",
                    },
                    {
                        "name":         "name",
                        "message":      "Zome package name?",
                        "default":      cargo_settings.package?.name || "",
                    },
                    {
                        "name":         "title",
                        "message":      "Zome package title?",
                        "default":      snakeToWords(cargo_settings.package?.name || ""),
                    },
                    {
                        "name":         "description",
                        "message":      "Zome package description?",
                        "default":      cargo_settings.package?.description || "",
                    },
                    {
                        "name":         "version",
                        "message":      "Zome package version?",
                        "default":      "0.1.0",
                    },
                    {
                        "name":         "tags",
                        "message":      "Zome package tags?",
                        "default":      "",
                        filter ( input ) {
                            if ( input.trim().length > 0 )
                                return input.split(",");
                            else
                                return [];
                        },
                    },
                ], config );

                Object.assign( config, answers );

                config.target           = path.relative(
                    path.dirname(output_abs_path),
                    path.resolve(
                        project.cwd,
                        config.target,
                    ),
                );

                log.normal("Writing new zome config to %s", output_abs_path );
                await writeJsonFile(
                    output_abs_path,
                    config,
                );

                const target_id         = config.name;

                await project.addZome( target_id, output_abs_path );

                return config;
            }, false )
        );

    subprogram
	.command("info")
	.description("Get info about a zome package name")
        .argument("<name>", "Package name")
	.action(
	    action_context(async function ({
		log,
                project,
	    }, package_name ) {
		const root_opts	        = program.opts();

		const zome_package      = await project.zomehub_client.get_zome_package_by_name( package_name );
		const versions          = await project.zomehub_client.get_zome_package_versions_sorted( zome_package.$id );

                if ( root_opts.data === true ) {
                    return {
                        "$id":      zome_package.$id,
                        "$action":  zome_package.$action,
                        "$addr":    zome_package.$addr,
                        ...zome_package.toJSON(),
                        "versions": versions,
                    };
                }

                return [
                    `${chalk.white(zome_package.name)} ` + chalk.gray(`(${zome_package.$id})`),
                    chalk.cyan(`  [${zome_package.zome_type}] ${zome_package.title}`),
                    `  ${zome_package.description}`,
                    ``,
                    chalk.magenta(`Versions`),
                    versions.map( zome_version => {
                        return `  ${chalk.white("v" + zome_version.version)}` + chalk.gray(` (v${zome_version.api_compatibility?.tested_with})`);
                    }),
                ].join("\n");
            })
        );

    subprogram
	.command("list")
	.description("List zomes")
        .option(`-a, --all`, `List all zome package names` )
        .argument("[agent]", "Agent pubkey (default to cell agent)")
	.action(
	    action_context(async function ({
		log,
                project,
	    }, agent ) {
		const opts		= this.opts();
		const root_opts	        = program.opts();

                if ( opts.all ) {
		    const links	        = await project.zomehub_client.get_all_zome_package_links();

                    if ( root_opts.data === true )
                        return links;

                    return links.map( link => {
                        return [
                            `${chalk.white(link.tagString())} ` + chalk.gray(`(by ${link.author})`),
                        ].join("\n");
                    }).join("\n\n");
                }

		const packages		= [] as any[];
		const zome_packages	= await project.zomehub_client.get_zome_packages_for_agent( agent ) as Record<string, any>;

		for ( let [entity_id, zome_package] of Object.entries( zome_packages ) ) {
		    packages.push( zome_package );
		}

                if ( root_opts.data === true )
                    return packages;

                return packages.map( zome_package => {
                    return [
                        `${chalk.white(zome_package.name)} ` + chalk.gray(`(${zome_package.$id})`),
                        chalk.cyan(`  [${zome_package.zome_type}] ${zome_package.title}`),
                        `  ${zome_package.description}`,
                    ].join("\n");
                }).join("\n\n");
	    })
	);

    const delete_subprogram            = subprogram
        .command("delete")
        .description("Delete a zome package")
        .argument("<id>", "Zome target ID")
        .option("-f, --force", "Skip confirmation prompt", false )
        .action(
            action_context(async function ({
                log,
                project,
            }, target_id ) {
                const opts              = this.opts();

                const zome_config       = project.getTargetConfig( "zome", target_id );
                const zome_package      = await project.zomehub_client.get_existing_zome_package({
                    "name":         zome_config.name,
                    "zome_type":    zome_config.zome_type,
                });

                if ( !zome_package )
                    throw new Error(`Could not find existing package for '${zome_config.name}'`);

                if ( opts.force !== true ) {
                    const prompt        = inquirer.createPromptModule();
                    const answers       = await prompt([
                        {
                            "type":     "confirm",
                            "name":     "confirm_delete",
                            "message":  `Are you sure you want to delete zome package '${zome_package.name}' (${zome_package.$id})?`,
                            "default":  false,
                        },
                    ]);

                    if ( answers.confirm_delete !== true )
                        return;
                }

                await project.zomehub_client.delete_zome_package( zome_package.$id );

                return zome_package;
            })
        );


    const versions_subprogram		= subprogram
	.command("versions")
	.description("Manage zome versions")
	.action( auto_help );

    versions_subprogram
	.command("list")
	.description("List my zome package versions")
	.argument("[target-id]", "Target ID")
	.action(
	    action_context(async function ({
                project,
	    }, target_id ) {
		const opts		= this.opts();

		const zome_packages	= await project.zomehub_client.get_zome_packages_for_agent() as Record<string, any>;

                let package_map         = {};

                if ( target_id ) {
		    if ( project.config?.zomes?.[ target_id ] === undefined )
		        return chalk.red(`No zome target named '${target_id}'`);

                    const zome_package  = Object.values( zome_packages ).find( zome => zome.name === target_id );

		    if ( !zome_package )
		        return chalk.red(`Zome target '${target_id}' has not been published yet`);

                    package_map[ zome_package.name ] = zome_package.$id;
                }
                else {
                    for ( let zome_package of Object.values(zome_packages) ) {
                        package_map[ zome_package.name ] = zome_package.$id;
                    }
                }

                for ( let [name, $id] of Object.entries(package_map) ) {
		    const versions      = await project.zomehub_client.get_zome_package_versions( $id );

                    package_map[ name ] = Object.fromEntries( await Promise.all(
                        Object.entries( versions ).map(
                            async ([v, zome_version]: any) => {
                                const zome  = await project.zomehub_client.get_zome_entry( zome_version.zome_entry );
                                zome_version.zome_entry = zome;

                                return [ v, zome_version ];
                            }
                        )
                    ));
                }

                return target_id
                    ? package_map[ target_id ]
                    : package_map;
	    })
	);

    const delete_version_subprogram     = versions_subprogram
        .command("delete")
        .description("Delete a zome package version")
        .argument("<id>", "Zome target ID")
        .argument("<version>", "Version to delete")
        .option("-f, --force", "Skip confirmation prompt", false )
        .action(
            action_context(async function ({
                log,
                project,
            }, target_id, version ) {
                const opts              = this.opts();

                const zome_config       = project.getTargetConfig( "zome", target_id );
                const zome_package      = await project.zomehub_client.get_existing_zome_package({
                    "name":         zome_config.name,
                    "zome_type":    zome_config.zome_type,
                });

                if ( !zome_package )
                    throw new Error(`Could not find existing package for '${zome_config.name}'`);

                const zome_version      = await project.zomehub_client.get_existing_zome_package_version({
                    "version":      semver.clean( version ),
                    "for_package":  zome_package.$id,
                });

                if ( !zome_version )
                    throw new Error(`Could not find existing version '${version}' for package '${zome_config.name}'`);

                if ( opts.force !== true ) {
                    const prompt        = inquirer.createPromptModule();
                    const answers       = await prompt([
                        {
                            "type":     "confirm",
                            "name":     "confirm_delete",
                            "message":  `Are you sure you want to delete zome package '${zome_package.name}' version '${zome_version.version}' (${zome_version.$id})?`,
                            "default":  false,
                        },
                    ]);

                    if ( answers.confirm_delete !== true )
                        return;
                }

                await project.zomehub_client.delete_zome_package_version( zome_version.$id );

                return zome_version;
            })
        );


    const wasms_subprogram		= subprogram
	.command("wasms")
	.description("Manage zome wasms")
	.action( auto_help );

    wasms_subprogram
	.command("list")
	.description("List my zome packages")
	.action(
	    action_context(async function ({
                project,
            }) {
		const opts		= this.opts();
		const zomes		= await project.zomehub_client.get_zome_entries_for_agent();

		return zomes;
	    })
	);

    return subprogram;
}

export default init;
