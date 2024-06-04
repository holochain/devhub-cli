import { Logger }			from '@whi/weblogger';
const log				= new Logger("test-basic", process.env.LOG_LEVEL );

import path				from 'path';
import { expect }			from 'chai';
import json				from '@whi/json';

import {
    Holochain
}					from '@spartan-hc/holochain-backdrop';

import {
    expect_reject,
    linearSuite,
    tmpfile,
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


describe("DevHub CLI - integration", function () {
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


function basic_tests () {
    let config_path;

    before(async function () {
	config_path			= await tmpfile( "config.json", {
	    app_port,
	    "app_token":	alice_token_hex,
	});
	log.normal("[tmp] project config path: %s", config_path );
    });

    it("should add zome target", async function () {
	const zome			= await main(
	    cmd([
		`-c`, config_path, `config`, `zomes`, `add`, `-y`,
		`-T`, `integrity`,
		`-n`, `Mere Memory`,
		`-d`, `Simple byte storage`,
		`-x`, `0.1.0`,
		`-w`, `./tests/zomes/mere_memory.wasm`,
		`mere_memory`,
	    ])
	);
    });

    it("should get devhub config", async function () {
	const config			= await main(
	    cmd(`-c ${config_path} config show`)
	);
	log.normal("Devhub config: %s", json.debug(config) );
    });

    it("should publish a zome target", async function () {
	const version			= await main(
	    cmd(`-c ${config_path} publish --new zome mere_memory`)
	);
	log.normal("Published version: %s", json.debug(version) );

	expect( version.version		).to.equal( "0.1.0" );
    });

    it("should list zomes", async function () {
	const zomes			= await main(
	    cmd(`-c ${config_path} zomes list`)
	);
	log.normal("Zomes: %s", json.debug(zomes) );

	expect( zomes			).to.have.length( 1 );
    });


    linearSuite("Errors", function () {

	it("should fail to publish invalid zome type", async function () {
	    await expect_reject(async () => {
		await main(
		    cmd(`-c ${config_path} publish zome invalid`)
		);
	    }, "No zome target with ID 'invalid'");
	});

    });
}
