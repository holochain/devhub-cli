
import fs				from 'fs/promises';
import path				from 'path';
import json				from '@whi/json';

import { Argument }			from 'commander';

import {
    EntryHash,
}					from '@spartan-hc/holo-hash';
import {
    TARGET_TYPES,
    ZOME_TYPES,
}					from './types.js';
import {
    readJsonFile,
    writeJsonFile,
}					from './utils.js';


export default function ({ program, action_context, auto_help }) {
    const subprogram			= program
	.command("install")
	.description("Install a target")
	.argument("<target-id>", "Target ID")
	.action(
	    action_context(async function ({
		log,
		project,
	    },target_id ) {
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

                const [
                    zome_package,
                    zome_version,
                    zome_wasm,
                ]                       = await project.zomehub_client.download_zome_package( target_id );

                const wasm_filepath     = path.resolve(
                    wasms_dir,
                    `${zome_wasm.hash}.wasm`,
                );
                console.log("Writing WASM to: %s", wasm_filepath );
                await fs.writeFile(
                    wasm_filepath,
                    zome_wasm.bytes,
                );

                const zome_pointer      = path.resolve(
                    zomes_dir,
                    `${zome_package.anchor}-${zome_version.version}.wasm`,
                );
                console.log("Creating named pointer to WASM: %s => %s", zome_pointer, wasm_filepath );
                await fs.symlink(
                    path.relative(
                        path.dirname( zome_pointer ),
                        wasm_filepath,
                    ),
                    zome_pointer,
                );

                return [
                    zome_package,
                    zome_version,
                    zome_wasm,
                ];
            })
        );

    return subprogram;
}
