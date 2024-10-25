
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
	.command("uninstall")
	.description("Uninstall a target")
	.argument("<name...>", "Zome package names to be uninstalled")
	.action(
	    action_context(async function ({
		log,
		project,
	    }, package_names ) {
		const opts		= this.opts();

                const removed_packages  = [] as Array<string>;

                for ( let pname of package_names ) {
                    const package_lock  = project.lock.zomes?.[ pname ];

                    if ( package_lock === undefined ) {
                        print(chalk.yellow("Zome package '%s' is not installed"), pname );
                        continue;
                    }

                    // Remove each version
                    for ( let [version, lock_info] of Object.entries( package_lock ) as any ) {
                        const wasm_filepath     = path.resolve( project.cwd, lock_info.local_source.wasm_filepath );
                        const zome_filepath     = path.resolve( project.cwd, lock_info.local_source.zome_filepath );

                        await fs.rm( wasm_filepath );
                        await fs.rm( zome_filepath );
                    }

                    delete project.lock.zomes[ pname ];

                    await project.saveLock();

                    removed_packages.push( pname );
                }

                return removed_packages;
            })
        );

    return subprogram;
}
