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

let admin;
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
        admin                           = holochain.admin;
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

	const set_conn                  = await main(
	    cmd(`--cwd ${TMPDIR} --user-homedir ${TMPDIR} -d connection set --cap-secret null ${app_port} ${alice_token_hex}`)
	);

	await main(
	    cmd(`--cwd ${TMPDIR} --user-homedir ${TMPDIR} -d init`)
	);

	const zome_config               = await main(
	    cmd([
		`--cwd`, TMPDIR,
		`--user-homedir`, TMPDIR,
                `-d`,
                `zomes`, `init`,
		`-w`, `mere_memory.wasm`,
		`-T`, `integrity`,
		`-c`, `mere_memory`,
		`-i`, `mere_memory`,
		`-n`, `Mere Memory`,
		`--package-description`, `Integrity rules for simple byte storage`,
		`-x`, `0.1.0`,
                `-y`,
	    ])
	);
        log.normal("Zome config for 'mere_memory': %s", json.debug(zome_config) );

        {
	    const conn_info             = await main(
	        cmd(`--cwd ${TMPDIR} --user-homedir ${TMPDIR} -d connection status`)
	    );
            log.normal("Connection: %s", json.debug(conn_info) );
        }

        {
	    const status                = await main(
	        cmd(`--cwd ${TMPDIR} --user-homedir ${TMPDIR} -d status`)
	    );
            log.normal("Status: %s", json.debug(status) );

            expect( status.whoami.pubkey    ).to.not.be.undefined;
        }

        {
	    const published             = await main(
	        cmd([
		    `--cwd`, TMPDIR,
                    `--user-homedir`, TMPDIR,
                    `publish`,
                    `--holochain-version`, `0.4.0-dev.20`,
                    `--hdi-version`, `0.5.0-dev.12`,
                    `--hdk-version`, `0.4.0-dev.14`,
                    `-f`,
                    `zome`, `mere_memory`,
                ])
	    );
            log.normal("Published: %s", json.debug(published) );
        }

        {
	    const zome                  = await main(
	        cmd(`--cwd ${TMPDIR} --user-homedir ${TMPDIR} -d install mere_memory`)
	    );
            log.normal("Zome: %s", json.debug(zome) );
        }

        log.normal("Temp location: %s", TMPDIR );
    });

    it("should list zomes", async function () {
	const zomes			= await main(
	    cmd(`--cwd ${TMPDIR} --user-homedir ${TMPDIR} -d zomes list`)
	);
	log.normal("%s", json.debug(zomes) );

	expect( zomes			).to.have.length( 1 );
    });

    it("should list zome versions", async function () {
	const versions			= await main(
	    cmd(`--cwd ${TMPDIR} --user-homedir ${TMPDIR} -d zomes versions list mere_memory`)
	);
	log.normal("%s", json.debug(versions) );

	expect( Object.keys(versions)	).to.have.length( 1 );
    });

    it("should list wasms", async function () {
	const wasms			= await main(
	    cmd(`--cwd ${TMPDIR} --user-homedir ${TMPDIR} -d zomes wasms list`)
	);
	log.normal("%s", json.debug(wasms) );

	expect( Object.keys(wasms)	).to.have.length( 1 );
    });

    // linearSuite("Errors", function () {
    // });
}
