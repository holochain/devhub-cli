import { Logger }			from '@whi/weblogger';
const log				= new Logger("test-basic", process.env.LOG_LEVEL );

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
}					from '../utils.js';
import {
    main,
}					from '../../lib/index.js';


describe("DevHub CLI - unit", function () {
    linearSuite("Basic", basic_tests );
});


function basic_tests () {
    it("should get version", async function () {
	await expect_reject(async () => {
	    await main(
		cmd(`--help`)
	    );
	}, "outputHelp" );
    });

    it("should init devhub project", async function () {
        const TMPDIR                    = await tmpdir();

	await main(
	    cmd(`-c ${TMPDIR} init`)
	);

	const status                    = await main(
	    cmd(`-c ${TMPDIR} status`)
	);
        log.normal("Status: %s", json.debug(status) );
    });

    linearSuite("Errors", function () {

    });
}
