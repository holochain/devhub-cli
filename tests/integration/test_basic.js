import { Logger }			from '@whi/weblogger';
const log				= new Logger("test-basic", process.env.LOG_LEVEL );

import os				from 'os';
import fs				from 'fs/promises';
import path				from 'path';
import crypto				from 'crypto';
import { expect }			from 'chai';
import json				from '@whi/json';

import {
    Holochain
}					from '@spartan-hc/holochain-backdrop';

import {
    expect_reject,
    linearSuite,
    tmpdir,
    tmpfile,
    cmd,
    hex,
}					from '../utils.js';
import {
    main,
    utils,
}					from '../../lib/index.js';


const __dirname				= path.dirname( new URL(import.meta.url).pathname );
// const APPHUB_DNA_PATH			= path.join( __dirname, "../dnas/apphub.dna" );
// const DNAHUB_DNA_PATH			= path.join( __dirname, "../dnas/dnahub.dna" );
const ZOMEHUB_DNA_PATH			= path.join( __dirname, "../dnas/zomehub.dna" );

let installations;
let app_port;
let client;
let alice_token_hex;
let alice_client
// let bobby_client;
let alice_appstore_csr;
// let bobby_appstore_csr;


describe("DevHub CLI - integration", function () {
    const holochain			= new Holochain({
	"timeout": 60_000,
	"default_stdout_loggers": log.level_rank > 3,
    });

    before(async function () {
	this.timeout( 60_000 );

	installations			= await holochain.install([
	    "alice",
	    // "bobby",
	], [
	    {
		"app_name": "test",
		"bundle": {
		    // "apphub":		APPHUB_DNA_PATH,
		    // "dnahub":		DNAHUB_DNA_PATH,
		    "zomehub":		ZOMEHUB_DNA_PATH,
		},
	    },
	]);

	app_port			= await holochain.ensureAppPort();
	alice_token_hex			= hex( installations.alice.test.auth.token );
    });

    linearSuite("Basic", basic_tests );

    after(async () => {
	await holochain.destroy();
    });
});

const TMPDIR                            = await tmpdir();

function basic_tests () {

    it("should execute demo script", async function () {
        this.timeout( 10_000 );

        // Create a fake wasm file
        await fs.writeFile(
            path.resolve( TMPDIR, "mere_memory.wasm" ),
            crypto.randomBytes( 10_000 ),
        );

	await main(
	    cmd(`-c ${TMPDIR} init`)
	);

	await main(
	    cmd([
		`-c`, TMPDIR,
                `zomes`, `init`, `-y`,
		`-T`, `integrity`,
		`-n`, `Mere Memory`,
		`-d`, `Integrity rules for simple byte storage`,
		`-x`, `0.1.0`,
		`-w`, `mere_memory.wasm`,
                `mere_memory`,
	    ])
	);

        {
	    const status                = await main(
	        cmd(`-c ${TMPDIR} status`)
	    );
            log.normal("Status: %s", json.debug(status) );
        }

        // TODO: ensure that connection information is only used in the tmpdir location
	await main(
	    cmd(`-c ${TMPDIR} connection update app_port ${app_port}`)
	);
	await main(
	    cmd(`-c ${TMPDIR} connection update app_token ${alice_token_hex}`)
	);

        {
	    const status                = await main(
	        cmd(`-c ${TMPDIR} status`)
	    );
            log.normal("Status: %s", json.debug(status) );
        }

        {
	    const published             = await main(
	        cmd(`-c ${TMPDIR} publish zome mere_memory`)
	    );
            log.normal("Published: %s", json.debug(published) );
        }

        {
	    const zome                  = await main(
	        cmd(`-c ${TMPDIR} install mere_memory`)
	    );
            log.normal("Zome: %s", json.debug(zome) );
        }

        log.normal("Temp location: %s", TMPDIR );
    });

    it("should list zomes", async function () {
	const zomes			= await main(
	    cmd(`-c ${TMPDIR} zomes list`)
	);
	log.normal("%s", json.debug(zomes) );

	expect( zomes			).to.have.length( 1 );
    });

    it("should list zome versions", async function () {
	const versions			= await main(
	    cmd(`-c ${TMPDIR} zomes versions list mere_memory`)
	);
	log.normal("%s", json.debug(versions) );

	expect( Object.keys(versions)	).to.have.length( 1 );
    });

    it("should list wasms", async function () {
	const wasms			= await main(
	    cmd(`-c ${TMPDIR} zomes wasms list`)
	);
	log.normal("%s", json.debug(wasms) );

	expect( Object.keys(wasms)	).to.have.length( 1 );
    });

    // linearSuite("Errors", function () {
    // });
}
