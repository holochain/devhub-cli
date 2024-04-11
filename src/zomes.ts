
import fs				from 'fs/promises';
import path				from 'path';

import { Argument }			from 'commander';


export default function ( program, action_context ) {
    const subprogram			= program
	.command("zomes")
	.description("Manage zomes");

    subprogram
	.command("list")
	.description("List my zomes")
	.action(
	    action_context(async function ({ zomehub_csr }) {
		const opts		= this.opts();
		const zomes		= await zomehub_csr.get_wasm_entries_for_agent();

		return zomes;
	    })
	);

    subprogram
	.command("publish")
	.argument(new Argument('<type>', 'zome type').choices(["integrity", "coordinator"]))
	.argument("<path>", "Path to zome (wasm) file")
	.description("Publish a zome (wasm)")
	.action(
	    action_context(async function ({ zomehub_csr }, zome_type, file_path ) {
		const opts		= this.opts();

		const abs_path		= path.resolve( file_path );
		const bytes		= await fs.readFile( abs_path );

		return await zomehub_csr[`save_${zome_type}`]( bytes );
	    })
	);

    return subprogram;
}
