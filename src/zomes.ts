
import fs				from 'fs/promises';
import path				from 'path';

import toml				from 'toml';
import inquirer				from 'inquirer';
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
            new Option(`-T, --zome-type <path>`, `zome type (default: "integrity")`)
                .choices( ZOME_TYPES )
        )
        .option(`-n, --package-name <string>`, `zome package name (default: "")` )
        .option(`-d, --package-description <string>`, `zome package description (default: "")` )
        .option(`-x, --package-version <string>`, `zome package version (default: "0.1.0")` )
        .option(`-m, --package-maintainer <hash>`, `zome package maintainer (default: "null")` )
        .option(`-l, --package-tags <string>`, `zome package tag (default: "[]")`, buildList )
        .option(`-y, --yes`, `use defaults for all prompts` )
        .option(`-f, --force`, `Create config even if the file already exists` )
        .argument("<target-id>", "Target ID")
        .argument("[location]", "Zome config location")
        .action(
            action_context(async function ({
                log,
                project,
            }, target_id, output_dir ) {
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

                const basename          = path.basename( opts.outputFile ?? "" );
                const default_name      = path.extname( basename ) === ""
                    ? basename
                    : basename.slice( 0, -path.extname( basename ).length );

                const config            = {
                    "type":                "zome",
                    "version":          opts.packageVersion ?? (
                        opts.yes ? "0.1.0" : undefined
                    ),
                    "target":           opts.targetPath ?? (
                        opts.yes ? "" : undefined
                    ),
                    "anchor":           target_id ?? (
                        opts.yes ? default_name : undefined
                    ),
                    "name":             opts.packageName ?? (
                        opts.yes ? default_name : undefined
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
                        "name":         "anchor",
                        "message":      "Zome package anchor?",
                        "default":      cargo_settings.package?.name || "",
                    },
                    {
                        "name":         "name",
                        "message":      "Zome package name?",
                        "default":      "",
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

                await project.addZome( target_id, output_abs_path );

                return config;
            }, false )
        );

    subprogram
	.command("list")
	.description("List my zomes")
	.action(
	    action_context(async function ({
		log,
                project,
	    }) {
		const opts		= this.opts();

		const packages		= [] as any[];
		const zome_packages	= await project.zomehub_client.get_zome_packages_for_agent() as Record<string, any>;
		const package_ids	= [] as Array<ZomeTarget["zome_package_id"]>;

		for ( let [entity_id, zome_package] of Object.entries( zome_packages ) ) {
		    package_ids.push( entity_id );
		    packages.push({
			"zome_package_id": entity_id,
			...zome_package,
		    });
		}

		// for ( let zome_config of Object.values(project.config.zomes) ) {
		//     packages.push({
		// 	"zome_package_id": null,
		// 	...zome_config,
		//     });
		// }

		return packages;
	    })
	);

    const versions_subprogram		= subprogram
	.command("versions")
	.description("Manage zome versions")
	.action( auto_help );

    versions_subprogram
	.command("list")
	.description("List my zome package versions")
	.argument("<target-id>", "Target ID")
	.action(
	    action_context(async function ({
                project,
	    }, target_id ) {
		const opts		= this.opts();

		if ( project.config?.zomes?.[ target_id ] === undefined )
		    throw new Error(`No zome target named '${target_id}'`);

		const zome_packages	= await project.zomehub_client.get_zome_packages_for_agent() as Record<string, any>;
                const zome_package      = Object.values( zome_packages ).find( zome => zome.anchor === target_id );

		if ( !zome_package )
		    throw new Error(`Zome target '${target_id}' has not been published yet`);

		const versions		= await project.zomehub_client.get_zome_package_versions( zome_package.$id );

		return Object.fromEntries( await Promise.all(
                    Object.entries( versions ).map(
                        async ([v, zome_version]: any) => {
                            const zome              = await project.zomehub_client.get_zome_entry( zome_version.zome_entry );
                            zome_version.zome_entry = zome;

                            return [ v, zome_version ];
                        }
                    )
                ));
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
