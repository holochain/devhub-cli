import { Logger }			from '@whi/weblogger';
const log				= new Logger("test-basic", process.env.LOG_LEVEL );

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

    before(async function () {
        // Create a fake wasm file
        await fs.writeFile(
            path.resolve( TMPDIR, "mere_memory.wasm" ),
            crypto.randomBytes( 10_000 ),
        );
    });

    it("should execute MVP publish/install cycle", async function () {
        this.timeout( 10_000 );

	await main(
	    cmd(`--cwd ${TMPDIR} init`)
	);

	await main(
	    cmd([
		`--cwd`, TMPDIR,
                `zomes`, `init`, `-y`,
		`-w`, `mere_memory.wasm`,
		`-T`, `integrity`,
		`-i`, `mere_memory`,
		`-x`, `0.1.0`,
		`-n`, `Mere Memory`,
		`-d`, `Integrity rules for simple byte storage`,
	    ])
	);

        {
	    const status                = await main(
	        cmd(`--cwd ${TMPDIR} status -d`)
	    );
            log.normal("Status: %s", json.debug(status) );
        }

        // TODO: ensure that connection information is only used in the tmpdir location
	await main(
	    cmd(`--cwd ${TMPDIR} connection set ${app_port} ${alice_token_hex}`)
	);

        {
	    const status                = await main(
	        cmd(`--cwd ${TMPDIR} status -d`)
	    );
            log.normal("Status: %s", json.debug(status) );
        }

        {
	    const published             = await main(
	        cmd([
		    `--cwd`, TMPDIR,
                    `publish`,
                    `--holochain-version`, `0.4.0-dev.20`,
                    `--hdi-version`, `0.5.0-dev.12`,
                    `--hdk-version`, `0.4.0-dev.14`,
                    `zome`, `mere_memory`,
                ])
	    );
            log.normal("Published: %s", json.debug(published) );
        }

        {
	    const zome                  = await main(
	        cmd(`--cwd ${TMPDIR} install mere_memory`)
	    );
            log.normal("Zome: %s", json.debug(zome) );
        }

        log.normal("Temp location: %s", TMPDIR );
    });

    it("should list zomes", async function () {
	const zomes			= await main(
	    cmd(`--cwd ${TMPDIR} zomes list`)
	);
	log.normal("%s", json.debug(zomes) );

	expect( zomes			).to.have.length( 1 );
    });

    it("should list zome versions", async function () {
	const versions			= await main(
	    cmd(`--cwd ${TMPDIR} zomes versions list mere_memory`)
	);
	log.normal("%s", json.debug(versions) );

	expect( Object.keys(versions)	).to.have.length( 1 );
    });

    it("should list wasms", async function () {
	const wasms			= await main(
	    cmd(`--cwd ${TMPDIR} zomes wasms list`)
	);
	log.normal("%s", json.debug(wasms) );

	expect( Object.keys(wasms)	).to.have.length( 1 );
    });

    // linearSuite("Errors", function () {
    // });
}
