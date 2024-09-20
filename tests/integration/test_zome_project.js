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
}					from '../../lib/index.js';


const __dirname				= path.dirname( new URL(import.meta.url).pathname );
const ZOMEHUB_DNA_PATH			= path.join( __dirname, "../dnas/zomehub.dna" );

let installations;
let app_port;
let client;

let alice_token_hex;
let alice_client
let alice_appstore_csr;


describe("DevHub CLI - integration::zome-project", function () {
    const holochain			= new Holochain({
	"timeout": 60_000,
	"default_stdout_loggers": log.level_rank > 3,
    });

    before(async function () {
	this.timeout( 60_000 );

	installations			= await holochain.install([
	    "alice",
	], [
	    {
		"app_name": "test",
		"bundle": {
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
        this.timeout( 10_000 );

        // Create a fake wasm file
        await fs.writeFile(
            path.resolve( TMPDIR, "mere_memory.wasm" ),
            crypto.randomBytes( 10_000 ),
        );

	const conn_config               = await main(
	    cmd(`--cwd ${TMPDIR} connection set ${app_port} ${alice_token_hex}`)
	);
	log.normal("[tmp] connection config: %s", json.debug(conn_config) );
    });

    it("should define a zome target", async function () {
	await main(
	    cmd(`--cwd ${TMPDIR} init`)
	);

	const zome			= await main(
	    cmd([
		`--cwd`, TMPDIR,
                `zomes`, `init`, `-y`,
		`-w`, `mere_memory.wasm`,
		`-T`, `integrity`,
		`-i`, `mere_memory`,
		`-x`, `0.1.0`,
		`-n`, `Mere Memory`,
		`-d`, `Simple byte storage`,
	    ])
	);
    });

    it("should get devhub config", async function () {
	const config			= await main(
	    cmd(`--cwd ${TMPDIR} status -d`)
	);
	log.normal("Devhub config: %s", json.debug(config) );
    });

    it("should publish a zome target", async function () {
        this.timeout( 10_000 );

	const result			= await main(
	    cmd([
		`--cwd`, TMPDIR,
                `publish`,
                `--holochain-version`, `0.4.0-dev.20`,
                `--hdi-version`, `0.5.0-dev.12`,
                `--hdk-version`, `0.4.0-dev.14`,
                `zome`, `mere_memory`,
            ])
	);
	log.normal("Published result: %s", json.debug(result) );

	// expect( result.?		).to.equal( "0.1.0" );
    });

    it("should list zomes", async function () {
	const zomes			= await main(
	    cmd(`--cwd ${TMPDIR} zomes list`)
	);
	log.normal("Zomes: %s", json.debug(zomes) );

	expect( zomes			).to.have.length( 1 );
    });


    linearSuite("Errors", function () {

	it("should fail to publish invalid zome type", async function () {
	    await expect_reject(async () => {
		await main(
		    cmd(`--cwd ${TMPDIR} publish zome invalid`)
		);
	    }, "No zome target with ID 'invalid'");
	});

    });
}
