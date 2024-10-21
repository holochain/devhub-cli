
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
	.command("install")
	.description("Install a target")
	.argument("<target-id...>", "Target ID")
	.action(
	    action_context(async function ({
		log,
		project,
	    }, target_ids ) {
		const opts		= this.opts();

                const zomes_dir         = path.resolve(
                    project.homedir,
                    "zomes",
                );
                const wasms_dir         = path.resolve(
                    project.homedir,
                    "wasms",
                );

                await project.ensureHomedir();
                await fs.mkdir( zomes_dir, { "recursive": true });
                await fs.mkdir( wasms_dir, { "recursive": true });

                for ( let tid of target_ids ) {
                    let version;

                    if ( tid.includes("#") ) {
                        const parts     = tid.split("#");
                        tid             = parts[0];
                        version         = parts[1];
                    }

                    print("Installing target '%s'", tid );
                    const [
                        zome_package,
                        zome_version,
                        zome_wasm,
                    ]                   = await project.zomehub_client.download_zome_package({
                        "name": tid,
                        version,
                    });

                    validate_package_name( zome_package.name );

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
                        `${zome_package.name}-${selected_version}.wasm`,
                    );
                    const wasm_path_rel = path.relative(
                        path.dirname( zome_pointer ),
                        wasm_filepath,
                    );

                    // Create org directory in case package name has one
                    log.normal("Creating org directory: %s", path.dirname( zome_pointer ) );
                    await fs.mkdir( path.dirname( zome_pointer ), {
                        "recursive":    true,
                    });

                    // Handle already existing install
                    if ( await fileExists( zome_pointer ) ) {
                        // Verify same wasm hashes
                        const existing_wasm_filepath = await fs.readlink( zome_pointer );

                        if ( existing_wasm_filepath !== wasm_path_rel )
                            throw new Error(`Existing WASM hash does not match received package; ${existing_wasm_filepath} !== ${zome_wasm.hash}`);

                        print("%s already installed", tid );
                        continue;
                    }

                    // log.debug("Creating named pointer to WASM: %s => %s", zome_pointer, wasm_filepath );
                    log.normal("Creating named pointer to WASM: %s => %s", zome_pointer, wasm_path_rel );
                    await fs.symlink(
                        wasm_path_rel,
                        zome_pointer,
                    );

                    delete zome_wasm.bytes;

                    if ( project.lock.zomes[ tid ] === undefined )
                        project.lock.zomes[ tid ] = {};

                    const lockspot      = project.lock.zomes[ tid ];

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
                                zome_pointer,
                            ),
                            "file_size":                    zome_wasm.file_size,
                        },
                        "dependencies": {},
                        "dev_dependencies": {},
                    });

                    await project.saveLock();
                }

                return target_ids;
            })
        );

    return subprogram;
}
