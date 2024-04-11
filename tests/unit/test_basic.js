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
}					from '../utils.js';
import {
    VERSION,
    main,
}					from '../../lib/index.js';


const __dirname				= path.dirname( new URL(import.meta.url).pathname );
const APPHUB_DNA_PATH			= path.join( __dirname, "../dnas/apphub.dna" );
const DNAHUB_DNA_PATH			= path.join( __dirname, "../dnas/dnahub.dna" );
const ZOMEHUB_DNA_PATH			= path.join( __dirname, "../dnas/zomehub.dna" );

let app_port;
let client;
let alice_client
let bobby_client;
let alice_appstore_csr;
let bobby_appstore_csr;


describe("DevHub CLI", function () {
    const holochain			= new Holochain({
	"timeout": 60_000,
	"default_stdout_loggers": log.level_rank > 3,
    });

    before(async function () {
	this.timeout( 60_000 );

	await holochain.install([
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
    });

    linearSuite("Basic", basic_tests );

    after(async () => {
	await holochain.destroy();
    });
});

function cmd ( args ) {
    return `node index.js ${args}`.split(" ");
}

function basic_tests () {
    it("should save a zome (wasm)", async function () {
	const wasm			= await main(
	    cmd(`-p ${app_port} -a test-alice zomes publish integrity ./tests/zomes/mere_memory.wasm`)
	);

	log.normal("%s", json.debug(wasm) );
    });

    it("should list zomes", async function () {
	const zomes			= await main(
	    cmd(`-p ${app_port} -a test-alice zomes list`)
	);
	log.normal("%s", json.debug(zomes) );

	expect( zomes			).to.have.length( 1 );
    });

    it("should fail to use --quiet and --verbose", async function () {
	expect_reject(async () => {
	    await main(
		cmd(`-q -v -p ${app_port} -a test-alice zomes list`)
	    );
	}, "Don't use both --quite and --verbose");
    });
}
