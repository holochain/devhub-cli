
import fs				from 'fs/promises';
import path				from 'path';
import json				from '@whi/json';

import chalk				from 'chalk';
import semver				from 'semver';
import { execa }		        from 'execa';
import { Argument }			from 'commander';

import {
    EntryHash,
}					from '@spartan-hc/holo-hash';
import {
    TARGET_TYPES,
    ZOME_TYPES,
}					from './types.js';
import {
    print,
    readJsonFile,
    writeJsonFile,
}					from './utils.js';


export default function ({ program, action_context, auto_help }) {
    const subprogram			= program
	.command("publish")
	.description("Publish a target")
	.addArgument(
	    new Argument("<type>", "Target type")
		.choices( TARGET_TYPES )
	)
	.argument("<id>", "Target ID")
	.option("--hdi-version <string>", "Specifically set the HDI version for API compatibitlity settings", null )
	.option("--hdk-version <string>", "Specifically set the HDK version for API compatibitlity settings", null )
	.option("--holochain-version <string>", "Specifically set the Holochain version for API compatibitlity settings", null )
	.option("--dry-run", "Create package without publishing", false )
	.action(
	    action_context(async function ({
		log,
                project,
	    }, target_type, target_id ) {
		const opts		= this.opts();

		if ( target_type === "zome" ) {
		    const target_ids		= Object.keys( project.config.zomes );

		    if ( !target_ids.includes( target_id ) )
			throw new Error(`No zome target with ID '${target_id}'; available targets: ${target_ids.join(",")}`);

		    const zome_config		= project.config.zomes[ target_id ];

		    if ( zome_config?.constructor?.name !== "ZomeConfig" )
			throw new TypeError(`Target config should be type 'zome'; not type '${zome_config["type"]}'`);

                    let hdi_version             = opts.hdiVersion;
                    let hdk_version             = opts.hdkVersion;
                    let holochain_version       = opts.holochainVersion;

                    try {
                        // Derive API compatibility
                        const hdi_line          = await execa(`cargo tree -p ${target_id} | grep " hdi " | head -n 1`, {
                            "cwd":      project.cwd,
                            "shell":    true,
                        });
                        log.debug("Cargo tree result for 'hdi': %s", hdi_line.stdout );
                        const cargo_hdi         = hdi_line.stdout.match(/hdi v(.*)/)?.[1];

                        if ( cargo_hdi )
                            hdi_version         = cargo_hdi;

                        const hdk_line          = await execa(`cargo tree -p ${target_id} | grep " hdk " | head -n 1`, {
                            "cwd":      project.cwd,
                            "shell":    true,
                        });
                        log.debug("Cargo tree result for 'hdk': %s", hdk_line.stdout );
                        const cargo_hdk         = hdk_line.stdout.match(/hdk v(.*)/)?.[1];

                        if ( cargo_hdk )
                            hdk_version         = cargo_hdk;

                        const holochain_line          = await execa(`holochain --version`, {
                            "shell":    true,
                        });
                        log.debug("Holochain version: %s", holochain_line.stdout );

                        holochain_version       = holochain_line.stdout.split(" ")[1];
                    } catch (err) {
                        if ( err.exitCode === undefined || err.exitCode === 0 )
                            throw err;
                    }

                    if ( !hdi_version )
                        return chalk.red(`HDI version could not be derived from cargo; set it manually with the --hdi-version option`);

                    if ( zome_config.zome_type === "coordinator"
                        && !hdk_version )
                        return chalk.red(`HDK version could not be derived from cargo; set it manually with the --hdk-version option`);

                    if ( !holochain_version )
                        return chalk.red(`Holochain version could not be derived; set it manually with the --holochain-version option`);

                    hdi_version                 = semver.clean( hdi_version );
                    if ( hdk_version )
                        hdk_version             = semver.clean( hdk_version );
                    holochain_version           = semver.clean( holochain_version );

                    if ( !semver.valid( hdi_version ) )
                        return chalk.red(`Invalid HDI version: ${hdi_version}`);
                    if ( hdk_version && !semver.valid( hdk_version ) )
                        return chalk.red(`Invalid HDK version: ${hdk_version}`);
                    if ( !semver.valid( holochain_version ) )
                        return chalk.red(`Invalid Holochain version: ${holochain_version}`);

		    // Check if package is already published
		    const zome_packages		= await project.zomehub_client.get_zome_packages_for_agent();
		    const package_list		= Object.values( zome_packages ) as any[];
		    const existing_package	= package_list.find( zome_pack => {
			return zome_pack.name === zome_config.name
			    && zome_pack.zome_type === zome_config.zome_type;
		    });

                    let maintainer                  = zome_config.maintainer;

                    if ( zome_config.name.startsWith("@") ) {
                        const [org_name, pack_name] = zome_config.name.slice(1).split("/");
                        const group_links           = await project.zomehub_client.get_my_group_links();
                        let existing_group          = group_links.find( link => link.tagString() === org_name );

                        if ( existing_group ) {
                            const group             = await project.coop_content_client.get_group( existing_group.target );
                            maintainer              = {
                                "type": "group",
                                "content": [ group.$id, group.$action ],
                            };
                            print("Using named group '%s': %s", org_name, json.debug(group) );
                        }
                        else {
                            const group_input       = {
                                "admins":           [ project.app_client.agent_id ],
                                "members":          [],
                                "published_at":     Date.now(),
                                "last_updated":     Date.now(),
                                "metadata":         {},
                            };

		            if ( opts.dryRun === false ) {
                                const group         = await project.coop_content_client.create_group( group_input );
                                await project.zomehub_client.create_named_group_link([
                                    org_name, group.$id
                                ]);
                                print("Created named group '%s': %s", org_name, json.debug(group) );

                                maintainer          = {
                                    "type": "group",
                                    "content": [ group.$id, group.$action ],
                                };
                            }
                            else {
                                print(
                                    chalk.yellow("Would create named group '%s': %s"),
                                    org_name, chalk.white(json.debug(group_input))
                                );
                                maintainer          = {
                                    "type": "group",
                                    "content": org_name,
                                };
                            }
                        }
                    }

                    let zome_package_input      = {
			"name":	        zome_config.name,
			"title":        zome_config.title,
			"description":  zome_config.description,
			"zome_type":    zome_config.zome_type,
			"maintainer":   maintainer,
			"tags":         zome_config.tags,
			"metadata":     zome_config.metadata,
		    };
		    let zome_package_id;

		    if ( existing_package ) {
			zome_package_id		= existing_package.$id;
                        print("Using Zome Package: %s", json.debug(existing_package) );
		    }
		    else if ( opts.dryRun === false ) {
			const zome_package	= await project.zomehub_client.create_zome_package(zome_package_input);
                        print("Created Zome Package: %s", json.debug(zome_package) );

			zome_package_id		= zome_package.$id;
		    }
                    else
                        print(chalk.yellow("Would create Zome Package: %s"), chalk.white(json.debug(zome_package_input)) );

                    if ( zome_package_id ) {
		        // Check if version is already published
		        const versions		= await project.zomehub_client.get_zome_package_versions( zome_package_id );
		        log.info("Versions for zome package '%s': %s", () => [
			    zome_package_id, json.debug(versions) ]);

		        const version_list	= Object.values( versions ) as any[];
		        // TODO: the better check would be the wasm hash, not the version
		        const existing_version	= version_list.find( version => {
			    return version.version === zome_config.version;
		        });

		        if ( existing_version && opts.dryRun === false )
			    throw new Error(`Package version '${zome_config.version}' has already been published`);
                    }

		    let zome_package_version_id;
		    let zome_wasm_addr;
		    let new_version;

		    // Check if wasm is already published
		    const zome_wasms	= await project.zomehub_client.get_zome_entries_for_agent();
		    const wasms_list	= Object.entries( zome_wasms ) as any[];

		    const wasm_bytes	= await fs.readFile(
			path.resolve(
			    path.dirname( project.configFilepath ),
			    zome_config.target
			)
		    );
		    const hash		= await project.mere_memory_client.calculate_hash( wasm_bytes );
		    const existing_wasm	= wasms_list.find( ([entity_id, wasm]) => wasm.hash === hash );

                    // console.log( existing_wasm );
		    if ( existing_wasm ) {
			zome_wasm_addr	= new EntryHash( existing_wasm[0] );
                        print("Using Zome: %s", json.debug(existing_wasm[1]) );
		    }
		    else if ( opts.dryRun === false ) {
			const save_fn	= `save_${zome_config.zome_type}`;
			const zome_wasm	= await project.zomehub_client[ save_fn ]( wasm_bytes );
                        print("Created Zome: %s", json.debug(zome_wasm) );

			zome_wasm_addr	= zome_wasm.$addr;
		    }
                    else {
                        const wasm_input = {
	                    "zome_type":        zome_config.zome_type,
	                    "mere_memory_addr": null,
                            "file_size":        wasm_bytes.length,
                            "hash":             await project.mere_memory_client.calculate_hash( wasm_bytes ),
	                };
                        print(chalk.yellow("Would create Zome: %s"), chalk.white(json.debug(wasm_input)) );
                    }

		    const version_input	= {
			"version": zome_config.version,
			"for_package": zome_package_id,
			"zome_entry": zome_wasm_addr,
                        "api_compatibility": {
                            "build_with": {
                                hdi_version,
                                hdk_version,
                            },
                            "tested_with": holochain_version,
                        },
		    };

                    if ( opts.dryRun !== false ) {
                        print(chalk.yellow("Would create Zome Package Version: %s"), chalk.white(json.debug(version_input)) );
                        return;
                    }

		    new_version		= await project.zomehub_client.create_zome_package_version( version_input );
                    print("Created Zome Version: %s", json.debug(new_version) );

                    return;
		}
		else
		    throw new TypeError(`Unhandled target type '${target_type}'`);
	    })
	);

    return subprogram;
}
