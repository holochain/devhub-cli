
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
	.command("publish")
	.description("Publish a target")
	.addArgument(
	    new Argument("<type>", "Target type")
		.choices( TARGET_TYPES )
	)
	.argument("<id>", "Target ID")
	.option("--dry-run", "Create package without publishing" )
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

		    // Check if package is already published
		    const zome_packages		= await project.zomehub_client.get_zome_packages_for_agent();
		    const package_list		= Object.values( zome_packages ) as any[];
		    const existing_package	= package_list.find( zome_pack => {
			return zome_pack.anchor === zome_config.name
			    && zome_pack.zome_type === zome_config.zome_type;
		    });

		    let zome_package_id;

		    if ( existing_package ) {
			zome_package_id		= existing_package.$id;
		    }
		    else {
			const zome_package	= await project.zomehub_client.create_zome_package({
			    "anchor":		target_id,
			    "name":		zome_config.name,
			    "description":	zome_config.description,
			    "zome_type":	zome_config.zome_type,
			    "maintainer":	zome_config.maintainer,
			    "tags":		zome_config.tags,
			    "metadata":		zome_config.metadata,
			});
			log.normal("Created new zome package: %s", json.debug(zome_package) );

			zome_package_id		= zome_package.$id;
		    }

		    // Check if version is already published
		    const versions		= await project.zomehub_client.get_zome_package_versions( zome_package_id );
		    log.info("Versions for zome package '%s': %s", () => [
			zome_package_id, json.debug(versions) ]);

		    const version_list		= Object.values( versions ) as any[];
		    // TODO: the better check would be the wasm hash, not the version
		    const existing_version	= version_list.find( version => {
			return version.version === zome_config.version;
		    });

		    let zome_package_version_id;
		    let zome_wasm_addr;
		    let new_version;

		    if ( existing_version ) {
			throw new Error(`Package version '${zome_config.version}' has already been published`);
		    }

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

		    if ( existing_wasm ) {
			zome_wasm_addr	= new EntryHash( existing_wasm[0] );
		    }
		    else {
			const save_fn	= `save_${zome_config.zome_type}`;
			const zome_wasm	= await project.zomehub_client[ save_fn ]( wasm_bytes );
			log.normal("Created new zome wasm: %s", json.debug(zome_wasm) );

			zome_wasm_addr	= zome_wasm.$addr;
		    }

		    const version_input	= {
			"version": zome_config.version,
			"for_package": zome_package_id,
			"zome_entry": zome_wasm_addr,
		    };
		    new_version		= await project.zomehub_client.create_zome_package_version( version_input );
		    log.normal("Created new zome package version: %s", json.debug(new_version) );

                    return new_version;
		}
		else
		    throw new TypeError(`Unhandled target type '${target_type}'`);
	    })
	);

    return subprogram;
}
