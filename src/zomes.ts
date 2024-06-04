
import fs				from 'fs/promises';
import path				from 'path';

import { Argument }			from 'commander';

import {
    ZomeTarget,
    SubprogramInitInput,
    SubprogramInitFunction,
}					from './types.js';
import {
    readJsonFile,
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
	.command("list")
	.description("List my zomes")
	.action(
	    action_context(async function ({
		log,
		devhub_settings,
		zomehub_csr,
	    }) {
		const opts		= this.opts();

		const packages		= [] as any[];
		const zome_packages	= await zomehub_csr.get_zome_packages_for_agent() as Record<string, any>;
		const package_ids	= [] as Array<ZomeTarget["zome_package_id"]>;

		for ( let [entity_id, zome_package] of Object.entries( zome_packages ) ) {
		    package_ids.push( entity_id );
		    packages.push({
			"zome_package_id": entity_id,
			...zome_package,
		    });
		}

		for ( let zome_config of Object.values(devhub_settings.zomes) ) {
		    if ( !package_ids.includes( String(zome_config.zome_package_id) ) ) {
			packages.push({
			    "zome_package_id": null,
			    ...zome_config,
			});
		    }
		}

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
		devhub_settings,
		zomehub_csr,
	    }, target_id ) {
		const opts		= this.opts();

		if ( devhub_settings?.zomes?.[ target_id ] === undefined )
		    throw new Error(`No zome target named '${target_id}'`);

		const zome_config	= devhub_settings.zomes[ target_id ];

		if ( !zome_config.zome_package_id )
		    throw new Error(`Zome target '${target_id}' has not been published yet`);

		const versions		= await zomehub_csr.get_zome_package_versions( zome_config.zome_package_id );

		return versions;
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
	    action_context(async function ({ zomehub_csr }) {
		const opts		= this.opts();
		const zomes		= await zomehub_csr.get_zome_entries_for_agent();

		return zomes;
	    })
	);

    return subprogram;
}

export default init;
