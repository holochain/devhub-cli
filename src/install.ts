
import fs				from 'fs/promises';
import path				from 'path';
import json				from '@whi/json';

import chalk				from 'chalk';
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
    fileExists,
    validate_package_name,
}					from './utils.js';


export default function ({ program, action_context, auto_help }) {
    const subprogram			= program
	.command("install").alias("i")
	.description("Install a target")
	.argument("[package-spec...]", "List of zome package specs to be installed")
	.action(
	    action_context(async function ({
		log,
		project,
	    }, package_specs ) {
		const opts		= this.opts();
		const root_opts		= program.opts();

                const zomes_dir         = path.resolve(
                    project.homedir,
                    "zomes",
                );
                const wasms_dir         = path.resolve(
                    project.homedir,
                    "wasms",
                );

                // Check lockfile network against connected network
                if ( project.lock.networks?.zomehub
                    && project.lock.networks.zomehub !== String(project.app_client.getRoleDnaHash( "zomehub" )) ) {
                    console.log([
                        chalk.red(`Lockfile network does not match connected devhub instance`),
                        chalk.yellow(`  Expected: ${project.lock.networks.zomehub}`),
                        chalk.yellow(`   Current: ${project.app_client.getRoleDnaHash( "zomehub" )}`),
                        ``,
                        `Support for multiple devhub networks has not been implemeted yet.  To continue...`,
                        `  1. Backup and remove your current 'devhub-lock.json'`,
                        `  2. Backup and remove your current '.devhub' directory`,
                        `  3. Reinstall your dependencies from the current devhub network`,
                        `    a. If some dependencies are not yet published on the network, you can either publish them yourself, or use the WASMs from the backup created in step 2`,
                        ``,
                    ].join("\n"));

                    if ( root_opts.data )
                        throw new Error(`Lockfile network does not match connected devhub instance; ${project.lock.networks.zomehub} !== ${project.app_client.getRoleDnaHash( "zomehub" )}`);

                    return;
                }

                if ( package_specs.length === 0 ) {
                    for ( let [pname, versions] of Object.entries(project.lock.zomes) ) {
                        for ( let [version, info] of Object.entries(versions as Record<string, any>) ) {
                            package_specs.push(`${pname}#${version}!${info.checksum}`);
                        }
                    }
                }

                await project.ensureHomedir();
                await fs.mkdir( zomes_dir, { "recursive": true });
                await fs.mkdir( wasms_dir, { "recursive": true });

                const installed_packages    = [] as Array<string>;

                for ( let package_spec of package_specs ) {
                    let pname           = package_spec;
                    let version;
                    let checksum;

                    if ( package_spec.includes("!") ) {
                        const parts     = package_spec.split("!");
                        package_spec    = parts[0];
                        checksum        = parts[1];
                    }

                    if ( package_spec.includes("#") ) {
                        const parts     = package_spec.split("#");
                        pname           = parts[0];
                        version         = parts[1];
                    }

                    print("Installing target '%s'", pname );
                    const [
                        zome_package,
                        zome_version,
                        zome_wasm,
                    ]                   = await project.zomehub_client.download_zome_package({
                        "name": pname,
                        version,
                    });

                    validate_package_name( zome_package.name );

                    {
                        const wasm_hash = await project.mere_memory_client.calculate_hash( zome_wasm.bytes );
                        if ( checksum && checksum !== wasm_hash ) {
                            log.warn("Package spec '%s' returned a different checksum than expected by the lockfile: %s !== %s", () => [
                                package_spec,
                                checksum,
                                wasm_hash,
                            ]);
                            continue;
                        }
                    }

                    const selected_version  = zome_version.version;
                    print("Using version: %s", selected_version );

                    const wasm_filepath = path.resolve(
                        wasms_dir,
                        `${zome_wasm.hash}.wasm`,
                    );
                    log.info("Writing WASM to: %s", wasm_filepath );
                    await fs.writeFile(
                        wasm_filepath,
                        zome_wasm.bytes,
                    );

                    const zome_pointer  = path.resolve(
                        zomes_dir,
                        `${zome_package.name}.wasm`,
                    );
                    const zome_version_pointer  = path.resolve(
                        zomes_dir,
                        `${zome_package.name}-${selected_version}.wasm`,
                    );
                    const wasm_path_rel = path.relative(
                        path.dirname( zome_version_pointer ),
                        wasm_filepath,
                    );

                    // Create org directory in case package name has one
                    log.normal("Creating org directory: %s", path.dirname( zome_version_pointer ) );
                    await fs.mkdir( path.dirname( zome_version_pointer ), {
                        "recursive":    true,
                    });

                    // Ensure the named pointer is pointing at this WASM
                    try {
                        await fs.access( zome_pointer );
                        await fs.unlink( zome_pointer );
                    } catch (err) {
                        if ( err.code !== "ENOENT" )
                            throw err;
                    }

                    log.normal("Creating generic pointer to WASM: %s => %s", zome_pointer, wasm_path_rel );
                    await fs.symlink(
                        wasm_path_rel,
                        zome_pointer,
                    );

                    // Handle already existing install
                    if ( await fileExists( zome_version_pointer ) ) {
                        // Verify same wasm hashes
                        const existing_wasm_filepath = await fs.readlink( zome_version_pointer );

                        if ( existing_wasm_filepath !== wasm_path_rel )
                            throw new Error(`Existing WASM hash does not match received package; ${existing_wasm_filepath} !== ${zome_wasm.hash}`);

                        print("%s already installed", pname );
                        continue;
                    }

                    log.normal("Creating named pointer to WASM: %s => %s", zome_version_pointer, wasm_path_rel );
                    await fs.symlink(
                        wasm_path_rel,
                        zome_version_pointer,
                    );

                    delete zome_wasm.bytes;

                    if ( project.lock.zomes[ pname ] === undefined )
                        project.lock.zomes[ pname ] = {};

                    const lockspot      = project.lock.zomes[ pname ];

                    if ( lockspot[ selected_version ] === undefined )
                        lockspot[ selected_version ] = {};

                    Object.assign( lockspot[ selected_version ], {
                        "zome_type":    zome_package.zome_type,
                        "checksum":     zome_wasm.hash,
                        "devhub_source": {
                            "zome_package_id":              zome_package.$id,
                            "zome_package_version_id":      zome_version.$id,
                            "zome_wasm_addr":               zome_wasm.$addr,
                            "mere_memory_addr":             zome_wasm.mere_memory_addr,
                        },
                        "local_source": {
                            "wasm_filepath":                path.relative(
                                path.dirname( project.lockFilepath ),
                                wasm_filepath,
                            ),
                            "zome_filepath":                path.relative(
                                path.dirname( project.lockFilepath ),
                                zome_version_pointer,
                            ),
                            "file_size":                    zome_wasm.file_size,
                        },
                        "dependencies": {},
                        "dev_dependencies": {},
                    });

                    await project.saveLock();

                    installed_packages.push( pname );
                }

                return installed_packages;
            })
        );

    return subprogram;
}
