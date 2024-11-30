
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
    validate_package_name,
}					from './utils.js';
import utils				from './utils.js';


export default function ({ program, action_context, auto_help }) {
    async function publish_zome ( log, project, opts, target_id, zome_config ) {
        //
        // Determine build context for API compatibility
        //
        let hdi_version                 = opts.hdiVersion;
        let hdk_version                 = opts.hdkVersion;
        let holochain_version           = opts.holochainVersion;

        // Derive API compatibility
        try {
            if ( !hdi_version )
                hdi_version             = await utils.deriveHdiVersionForCrate( project.cwd, target_id, false );

            if ( !hdk_version )
                hdk_version             = await utils.deriveHdkVersionForCrate( project.cwd, target_id, false );

            if ( !holochain_version )
                holochain_version       = await utils.deriveHolochainVersionForCrate( project.cwd, false );
        } catch (err) {
            if ( err.exitCode === undefined || err.exitCode === 0 )
                throw err;
        }

        if ( !hdi_version )
            throw new Error(`HDI version could not be derived from cargo; set it manually with the --hdi-version option`);
        if ( !hdk_version && zome_config.zome_type === "coordinator" )
            throw new Error(`HDK version could not be derived from cargo; set it manually with the --hdk-version option`);
        if ( !holochain_version )
            throw new Error(`Holochain version could not be derived; set it manually with the --holochain-version option`);

        hdi_version                     = semver.clean( hdi_version );
        if ( hdk_version )
            hdk_version                 = semver.clean( hdk_version );
        holochain_version               = semver.clean( holochain_version );

        // TODO: allow --force to override this check
        if ( !semver.valid( hdi_version ) )
            throw new Error(`Invalid HDI version: ${hdi_version}`);
        if ( hdk_version && !semver.valid( hdk_version ) )
            throw new Error(`Invalid HDK version: ${hdk_version}`);
        if ( !semver.valid( holochain_version ) )
            throw new Error(`Invalid Holochain version: ${holochain_version}`);


        //
        // Determine maintainer context
        //
        let maintainer                  = zome_config.maintainer;

        if ( zome_config.name.startsWith("@") ) {
            // Determine maintainer group
            const [org_name, _]         = zome_config.name.slice(1).split("/");
            let existing_group;
            try {
                existing_group          = await project.zomehub_client.get_group_by_name( org_name );
            } catch (err) {
                if ( !err.message.includes("Found 0 groups") )
                    throw err;
            }

            if ( existing_group ) {
                // TODO: check if I am a member of that group.  Make sure this check is done based
                // on the zome package maintainer.
                if ( !existing_group.isContributor( project.cell_agent ) )
                    throw new Error(`You are not a contributor in the '@${org_name}' (${existing_group.$id})`);

                maintainer              = {
                    "type":     "group",
                    "content":  [ existing_group.$id, existing_group.$action ],
                };
                print("Using named group '%s': %s", org_name, json.debug(existing_group.toJSON(true)) );
            }
            else {
                const group_input       = {
                    "name":     org_name,
                    "admins":   [ project.app_client.agent_id ],
                };

                if ( opts.dryRun === false ) {
                    const group         = await project.zomehub_client.create_org( group_input );
                    print("Created named group '%s': %s", org_name, json.debug(group.toJSON(true)) );

                    maintainer          = {
                        "type":     "group",
                        "content":  [ group.$id, group.$action ],
                    };
                }
                else {
                    print(
                        chalk.yellow("Would create group: %s"),
                        chalk.white(json.debug(group_input))
                    );
                    maintainer          = {
                        "type":     "group",
                        "content":  org_name,
                    };
                }
            }
        }


        //
        // Determine ZomePackage context
        //
        validate_package_name( zome_config.name );

        // Check if package is already published
        const existing_package          = await project.zomehub_client.get_existing_zome_package({
            "name":         zome_config.name,
            "zome_type":    zome_config.zome_type,
        });

        const zome_package_input        = {
            "name":         zome_config.name,
            "title":        zome_config.title,
            "description":  zome_config.description,
            "zome_type":    zome_config.zome_type,
            "maintainer":   maintainer,
            "tags":         zome_config.tags,
        };
        let zome_package_id;

        // Create ZomePackage
        if ( existing_package ) {
            zome_package_id             = existing_package.$id;
            print("Using Zome Package: %s", json.debug(existing_package.toJSON(true)) );
        }
        else if ( opts.dryRun === false ) {
            const zome_package          = await project.zomehub_client.create_zome_package(zome_package_input);
            print("Created Zome Package: %s", json.debug(zome_package.toJSON(true)) );

            zome_package_id             = zome_package.$id;
        }
        else
            print(chalk.yellow("Would create Zome Package: %s"), chalk.white(json.debug(zome_package_input)) );


        //
        // Determine Zome (WASM) context
        //
        let zome_wasm_addr;

        // Check if wasm is already published
        const wasm_bytes                = await project.loadZomeTargetWasm( target_id );
        const current_hash              = await project.mere_memory_client.calculate_hash( wasm_bytes );
        const existing_zome             = await project.zomehub_client.get_zome_by_wasm_hash({
            "hash":         current_hash,
            "zome_type":    zome_config.zome_type,
        });

        // Check if any existing version already uses this WASM
        if ( zome_package_id ) {
            const match                 = await project.zomehub_client.zome_package_version_with_hash_exists({
                "hash":         current_hash,
                "for_package":  zome_package_id,
            });

            if ( match )
                throw new Error(`Current WASM (${current_hash}) was already used in zome package version '${match[0].version}'`);
        }

        if ( existing_zome ) {
            zome_wasm_addr              = existing_zome.$addr;
            print("Using Zome: %s", json.debug(existing_zome.toJSON(true)) );
        }
        else if ( opts.dryRun === false ) {
            let zome_wasm;

            if ( zome_config.zome_type === "integrity" )
                zome_wasm               = await project.zomehub_client.save_integrity( wasm_bytes );
            else if ( zome_config.zome_type === "coordinator" )
                zome_wasm               = await project.zomehub_client.save_integrity( wasm_bytes );
            else
                throw new TypeError(`Zome config has unknown zome type '${zome_config.zome_type}'`);

            print("Created Zome: %s", json.debug(zome_wasm.toJSON(true)) );
            zome_wasm_addr              = zome_wasm.$addr;
        }
        else {
            print(chalk.yellow("Would create [%s] Zome for WASM (%s)"), zome_config.zome_type, current_hash );
        }


        //
        // Determine ZomePackageVersion context
        //
        if ( zome_package_id ) {
            // Check if version was already published
            // TODO: should also check the wasm hash, not just the version
            const existing_version      = await project.zomehub_client.zome_package_version_exists({
                "version":      zome_config.version,
                "for_package":  zome_package_id,
            });

            if ( existing_version )
                throw new Error(`Zome package version '${zome_config.version}' has already been published for zome package '${zome_config.name}'`);
        }

        const version_input             = {
            "version":          zome_config.version,
            "for_package":      zome_package_id,
            "zome_entry":       zome_wasm_addr,
            "readme":           zome_config.readme
                ? utils.encodeText( await utils.readTextFile( zome_config.readme ) )
                : null,
            "api_compatibility": {
                "build_with": {
                    hdi_version,
                    hdk_version,
                },
                "tested_with":  holochain_version,
            },
            "metadata":         zome_config.metadata,
        };

        if ( opts.dryRun !== false ) {
            print(chalk.yellow("Would create Zome Package Version: %s"), chalk.white(json.debug(version_input)) );
            return;
        }

        const new_version               = await project.zomehub_client.create_zome_package_version( version_input );
        print("Created Zome Version: %s", json.debug(new_version.toJSON(true)) );

        return;
    }


    const subprogram                    = program
        .command("publish")
        .description("Publish a target")
        .option("--hdi-version <string>", "Specifically set the HDI version for API compatibitlity settings", null )
        .option("--hdk-version <string>", "Specifically set the HDK version for API compatibitlity settings", null )
        .option("--holochain-version <string>", "Specifically set the Holochain version for API compatibitlity settings", null )
        .option("--dry-run", "Create package without publishing", false )
        .option(`-f, --force`, `Skip crate check` )
        .addArgument(
            new Argument("<type>", "Target type")
                .choices( TARGET_TYPES )
        )
        .argument("<id>", "Target ID")
        .action(
            action_context(async function ({
                log,
                project,
            }, target_type, target_id ) {
                const opts              = this.opts();

                // Get target config
                const target_config     = project.getTargetConfig( target_type, target_id );

                if ( target_type === "zome" ) {
                    // Check if target ID is a cargo package
                    if ( opts.force !== true ) {
                        const crate_info    = await utils.crateInfo( project.cwd, target_id );

                        if ( !crate_info )
                            throw new Error(`Cannot find a matching cargo package for target ID '${target_id}'`);
                    }

                    return await publish_zome( log, project, opts, target_id, target_config );
                    // Example NPM output
                    // ```
                    // npm notice
                    // npm notice 📦  @holochain/devhub-cli@0.2.0-dev.0
                    // npm notice Tarball Contents
                    // npm notice 1.2kB README.md
                    // npm notice 139B lib/config.d.ts
                    // npm notice 1.9kB lib/config.js
                    // npm notice 1.7kB lib/config.js.map
                    // npm notice 82B lib/general.d.ts
                    // npm notice 2.9kB lib/general.js.map
                    // npm notice 274B lib/index.d.ts
                    // npm notice 15.2kB lib/index.js
                    // npm notice 11.6kB lib/index.js.map
                    // npm notice 139B lib/install.d.ts
                    // npm notice 2.8kB lib/install.js
                    // npm notice 2.6kB lib/install.js.map
                    // npm notice 139B lib/publish.d.ts
                    // npm notice 11.3kB lib/publish.js
                    // npm notice 8.6kB lib/publish.js.map
                    // npm notice 2.0kB lib/types.d.ts
                    // npm notice 183B lib/types.js
                    // npm notice 244B lib/types.js.map
                    // npm notice 1.1kB lib/utils.d.ts
                    // npm notice 2.2kB lib/utils.js
                    // npm notice 2.5kB lib/utils.js.map
                    // npm notice 2.7kB lib/utils/project.d.ts
                    // npm notice 12.7kB lib/utils/project.js
                    // npm notice 11.6kB lib/utils/project.js.map
                    // npm notice 886B lib/utils/zome_config.d.ts
                    // npm notice 2.3kB lib/utils/zome_config.js
                    // npm notice 2.4kB lib/utils/zome_config.js.map
                    // npm notice 118B lib/zomes.d.ts
                    // npm notice 10.2kB lib/zomes.js
                    // npm notice 9.0kB lib/zomes.js.map
                    // npm notice 1.3kB package.json
                    // npm notice Tarball Details
                    // npm notice name: @holochain/devhub-cli
                    // npm notice version: 0.2.0-dev.0
                    // npm notice filename: holochain-devhub-cli-0.2.0-dev.0.tgz
                    // npm notice package size: 27.5 kB
                    // npm notice unpacked size: 121.9 kB
                    // npm notice shasum: fb776dd79d559484182580da75be6f340be87eca
                    // npm notice integrity: sha512-1C3MfzAuSAUc3[...]HQRhGWZUGtrbQ==
                    // npm notice total files: 31
                    // npm notice
                    // holochain-devhub-cli-0.2.0-dev.0.tgz
                    // ```
                }
                else
                    throw new TypeError(`Unhandled target type '${target_type}'`);
            })
        );


    async function publish_zome_update ( log, project, opts, publish_opts, target_id, zome_config ) {
        //
        // Determine ZomePackage context
        //
        const existing_package          = await project.zomehub_client.get_existing_zome_package({
            "name":         zome_config.name,
            "zome_type":    zome_config.zome_type,
        });

        if ( !existing_package )
            throw new Error(`Could not find an existing zome package for '${zome_config.name}'`);

        const zome_package_input        = {
            "title":        zome_config.title,
            "description":  zome_config.description,
            "tags":         zome_config.tags,
        };

        print("Current Zome Package: %s", json.debug(existing_package.toJSON(true)) );

        // Only update the package if a property has changed
        if ( utils.deepSubset( existing_package, zome_package_input ) )
            throw new Error(`No properties changed for package '${zome_config.name}'`);

        if ( publish_opts.dryRun === false ) {
            const zome_package          = await project.zomehub_client.update_zome_package({
                "base": existing_package.$action,
                "properties": zome_package_input,
            });
            print("Updated Zome Package: %s", json.debug(zome_package.toJSON(true)) );

            return zome_package;
        }
        else
            print(chalk.yellow("Would update Zome Package properties: %s"), chalk.white(json.debug(zome_package_input)) );
    }

    const update_subprogram            = subprogram
        .command("update")
        .description("Publish a zome package update")
        .addArgument(
            new Argument("<type>", "Target type")
                .choices( TARGET_TYPES )
        )
        .argument("<id>", "Target ID")
        .action(
            action_context(async function ({
                log,
                project,
            }, target_type, target_id ) {
                const opts              = this.opts();
                const publish_opts      = this.parent.opts();

                const target_config     = project.getTargetConfig( target_type, target_id );

                if ( target_type === "zome" ) {
                    return await publish_zome_update( log, project, opts, publish_opts, target_id, target_config );
                }
                else
                    throw new TypeError(`Unhandled target type '${target_type}'`);
            })
        );


    async function publish_zome_version_update ( log, project, opts, publish_opts, target_id, zome_config ) {
        //
        // Determine ZomePackage context
        //
        const existing_package          = await project.zomehub_client.get_existing_zome_package({
            "name":         zome_config.name,
            "zome_type":    zome_config.zome_type,
        });

        if ( !existing_package )
            throw new Error(`Could not find an existing zome package for '${zome_config.name}'`);

        const existing_version          = await project.zomehub_client.get_existing_zome_package_version({
            "version":      zome_config.version,
            "for_package":  existing_package.$id,
        });

        if ( !existing_version )
            throw new Error(`Could not find an existing version '${zome_config.version}' zome package for '${zome_config.name}'`);

        // I don't think there is a scenario where this could happen because we are looking up the
        // version based on the zome config.  So the check is here just in case.
        if ( semver.clean( existing_version.version ) !== zome_config.version )
            throw new Error(`Zome config '${zome_config.rel_filepath}' version (v${zome_config.version}) does not match the existing zome package version (v${semver.clean(existing_version.version)})`);

        await existing_version.$fetchReadme();

        // Trim new/old README to ensure more than whitespace has changed
        if ( existing_version.readme )
            existing_version.readme     = existing_version.readme.trim();

        const zome_version_input        = {
            "readme":                   zome_config.readme
                ? (await utils.readTextFile( zome_config.readme )).trim()
                : null,
            "source_code_revision_uri": zome_config.source_code_revision_uri || null,
            "metadata":                 zome_config.metadata,
        };

        print("Current Zome Package Version: %s", json.debug(existing_version.toJSON(true)) );
        print("Current Zome config: %s", json.debug(zome_config) );
        print("Zome version input: %s", json.debug(zome_version_input) );

        // Only update the package if a property has changed
        if ( utils.deepSubset( existing_version, zome_version_input ) )
            throw new Error(`No properties changed for package '${zome_config.name}'`);

        // Convert README text to bytes after deep equal check
        zome_version_input.readme       = utils.encodeText( zome_version_input.readme ) as any;


        if ( publish_opts.dryRun === false ) {
            const zome_version          = await project.zomehub_client.update_zome_package_version({
                "base":         existing_version.$action,
                "properties":   zome_version_input,
	    });
            print("Updated Zome Package Version: %s", json.debug(zome_version.toJSON(true)) );

            return zome_version;
        }
        else
            print(chalk.yellow("Would update Zome Package Version properties: %s"), chalk.white(json.debug(zome_version_input)) );
    }

    const version_subprogram            = subprogram
	.command("version")
	.action( auto_help );

    const version_update_subprogram     = version_subprogram
        .command("update")
        .description("Publish a zome package version update")
        .addArgument(
            new Argument("<type>", "Target type")
                .choices( TARGET_TYPES )
        )
        .argument("<id>", "Target ID")
        .action(
            action_context(async function ({
                log,
                project,
            }, target_type, target_id ) {
                const opts              = this.opts();
                const publish_opts      = this.parent.parent.opts();

                const target_config     = project.getTargetConfig( target_type, target_id );

                if ( target_type === "zome" ) {
                    return await publish_zome_version_update( log, project, opts, publish_opts, target_id, target_config );
                }
                else
                    throw new TypeError(`Unhandled target type '${target_type}'`);
            })
        );

    return subprogram;
}
