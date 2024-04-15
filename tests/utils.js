import { Logger }			from '@whi/weblogger';
const log				= new Logger("test-utils", process.env.LOG_LEVEL );

import os				from 'os';
import fs				from 'fs/promises';
import path				from 'path';

import { expect }			from 'chai';


export async function expect_reject ( cb, error, message ) {
    let failed				= false;
    try {
	await cb();
    } catch (err) {
	failed				= true;
	expect( () => { throw err }	).to.throw( error, message );
    }
    expect( failed			).to.be.true;
}


export function linearSuite ( name, setup_fn, args_fn ) {
    describe( name, function () {
	beforeEach(function () {
	    let parent_suite		= this.currentTest.parent;
	    if ( parent_suite.tests.some(test => test.state === "failed") )
		this.skip();
	    if ( parent_suite.parent?.tests.some(test => test.state === "failed") )
		this.skip();
	});
	setup_fn.call( this, args_fn );
    });
}


const TMPDIR				= await fs.mkdtemp(
    path.join( os.tmpdir(), "devhub-cli-" )
);
export async function tmpfile ( name, data ) {
    const file_path			= path.resolve( TMPDIR, name );

    if ( data instanceof Uint8Array )
	await fs.writeFile( file_path, data );
    else {
	if ( typeof data !== "string" )
	    data			= JSON.stringify( data, null, 4 );

	await fs.writeFile( file_path, data );
    }

    return file_path;
}


const DEFAULT_VERBOSITY_LEVEL		= Math.max( log.level_rank - 2, 0 );
const DEFAULT_VERBOSITY			= DEFAULT_VERBOSITY_LEVEL > 0
      ? "-" + "v".repeat( DEFAULT_VERBOSITY_LEVEL )
      : "-q";

export function cmd ( args, verbosity = DEFAULT_VERBOSITY ) {
    return `node index.js ${verbosity} ${args}`.split(" ");
}


export default {
    expect_reject,
    linearSuite,
    tmpfile,
    cmd,
};
