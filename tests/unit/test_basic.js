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

    linearSuite("Errors", function () {

    });
}
