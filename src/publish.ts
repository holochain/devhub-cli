
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
	.option("-n, --new", "Expect to create the a new package" )
	.action(
	    action_context(async function ({
		log,
		devhub_config_path,
		devhub_config,
		devhub_settings,
		mere_memory_api,
		zomehub_csr,
	    }, target_type, target_id ) {
		const opts		= this.opts();

		if ( target_type === "zome" ) {
		    if ( devhub_settings.zomes === undefined )
			throw new Error(`No zome targets in config '${devhub_config_path}'`);

		    const target_ids		= Object.keys( devhub_settings.zomes );

		    if ( !target_ids.includes( target_id ) )
			throw new Error(`No zome target with ID '${target_id}'; available targets: ${target_ids.join(",")}`);

		    const zome_config		= devhub_settings.zomes[ target_id ];

		    if ( zome_config["type"] !== "zome" )
			throw new TypeError(`Target config should be type 'zome'; not type '${zome_config["type"]}'`);

		    // Check if package is already published
		    const zome_packages		= await zomehub_csr.get_zome_packages_for_agent();
		    const package_list		= Object.values( zome_packages ) as any[];
		    const existing_package	= package_list.find( zome_pack => {
			return zome_pack.name === zome_config.name
			    && zome_pack.zome_type === zome_config.zome_type;
		    });

		    let zome_package_id;

		    // If '--new' is set, we are not expecting an existing match.  Otherwise, create
		    // the new package.
		    if ( existing_package ) {
			if ( opts["new"] === true )
			    throw new Error(`Expected to create a new zome package but you already have a package with the name '${zome_config.name}' (${existing_package.$id})`);

			zome_package_id		= existing_package.$id;
		    }
		    else {
			if ( opts["new"] !== true )
			    throw new Error(`Not expecting to create a new zome package but you don't have a package with the name '${zome_config.name}'`);

			const zome_package	= await zomehub_csr.create_zome_package({
			    "name":		zome_config.name,
			    "description":	zome_config.description,
			    "zome_type":	zome_config.zome_type,
			    "maintainer":	zome_config.maintainer,
			    "tags":		zome_config.tags,
			    "metadata":	zome_config.metadata,
			});
			log.normal("Created new zome package: %s", json.debug(zome_package) );

			zome_package_id		= zome_package.$id;
		    }

		    // Update if config does not have the package ID already
		    if ( zome_config.zome_package_id !== String(zome_package_id) ) {
			let updated_config_path		= devhub_config_path;
			let updated_config		= devhub_config;

			// Write new package ID to zome config file
			if ( typeof devhub_config.zomes[ target_id ] === "string" ) {
			    updated_config_path		= devhub_config.zomes[ target_id ];
			    updated_config		= {
				zome_package_id,
				...await readJsonFile( updated_config_path ),
			    };
			}
			else {
			    devhub_config.zomes[ target_id ]	= {
				zome_package_id,
				...devhub_config.zomes[ target_id ],
			    };
			}

			log.normal("Writing updated zome config: %s", updated_config_path );
			await writeJsonFile(
			    updated_config_path,
			    updated_config,
			);
		    }

		    // Check if version is already published
		    const versions		= await zomehub_csr.get_zome_package_versions( zome_package_id );
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
			zome_package_version_id	= existing_version.$id;
		    }
		    else {
			// Check if wasm is already published
			const zome_wasms	= await zomehub_csr.get_zome_entries_for_agent();
			const wasms_list	= Object.entries( zome_wasms ) as any[];

			const wasm_bytes	= await fs.readFile(
			    path.resolve(
				path.dirname(devhub_config_path),
				zome_config.target
			    )
			);
			const hash		= await mere_memory_api.calculate_hash( wasm_bytes );
			const existing_wasm	= wasms_list.find( ([entity_id, wasm]) => wasm.hash === hash );

			if ( existing_wasm ) {
			    zome_wasm_addr	= new EntryHash( existing_wasm[0] );
			}
			else {
			    const save_fn	= `save_${zome_config.zome_type}`;
			    const zome_wasm	= await zomehub_csr[ save_fn ]( wasm_bytes );
			    log.normal("Created new zome wasm: %s", json.debug(zome_wasm) );

			    zome_wasm_addr	= zome_wasm.$addr;
			}

			const version_input	= {
			    "version": zome_config.version,
			    "for_package": zome_package_id,
			    "zome_entry": zome_wasm_addr,
			};
			new_version		= await zomehub_csr.create_zome_package_version( version_input );
			log.normal("Created new zome package version: %s", json.debug(new_version) );

			zome_package_version_id	= new_version.$id;
		    }

		    // Update if config does not have the package version ID already
		    if ( zome_config.zome_package_version_id !== String(zome_package_version_id) ) {
			let updated_config_path		= devhub_config_path;
			let updated_config		= devhub_config;

			// Write new package ID to zome config file
			if ( typeof devhub_config.zomes[ target_id ] === "string" ) {
			    updated_config_path		= devhub_config.zomes[ target_id ];
			    updated_config		= {
				"zome_package_id":	null,
				zome_package_version_id,
				...await readJsonFile( updated_config_path ),
			    };
			}
			else {
			    devhub_config.zomes[ target_id ]	= {
				"zome_package_id":	null,
				zome_package_version_id,
				...devhub_config.zomes[ target_id ],
			    };
			}

			log.normal("Writing updated zome config: %s", updated_config_path );
			await writeJsonFile(
			    updated_config_path,
			    updated_config,
			);
		    }

		    if ( existing_version )
			throw new Error(`Package version '${zome_config.version}' has already been published`);

		    return new_version;
		}
		else
		    throw new TypeError(`Unhandled target type '${target_type}'`);
	    })
	);

    return subprogram;
}
