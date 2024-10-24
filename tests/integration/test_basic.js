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
const APPHUB_DNA_PATH			= path.join( __dirname, "../dnas/apphub.dna" );
const DNAHUB_DNA_PATH			= path.join( __dirname, "../dnas/dnahub.dna" );
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


function basic_tests () {
    it("should list zomes", async function () {
	const zomes			= await main(
	    cmd(`-p ${app_port} -a ${alice_token_hex} zomes list`)
	);
	log.normal("%s", json.debug(zomes) );

	expect( zomes			).to.have.length( 0 );
    });

    it("should derive context from project config", async function () {
	const config_path		= await tmpfile( "config.json", {
	    app_port,
	    "app_token":	alice_token_hex,
	});
	log.normal("[tmp] project config path: %s", config_path );

	const zomes			= await main(
	    cmd(`-c ${config_path} zomes list`)
	);
	log.normal("%s", json.debug(zomes) );

	expect( zomes			).to.have.length( 0 );
    });


    linearSuite("Errors", function () {

	it("should fail to use --quiet and --verbose", async function () {
	    await expect_reject(async () => {
		await main(
		    cmd(`-q -v -p ${app_port} -a ${alice_token_hex} zomes list`)
		);
	    }, "Don't use both --quite and --verbose");
	});

	it("should fail to call non-existent command", async function () {
	    await expect_reject(async () => {
		await main(
		    cmd(`-p ${app_port} -a ${alice_token_hex} invalid command`)
		);
	    }, "too many arguments");
	});

    });
}
