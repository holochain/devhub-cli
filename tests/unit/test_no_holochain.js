import { Logger }			from '@whi/weblogger';
const log				= new Logger("test-basic", process.env.LOG_LEVEL );

import path				from 'path';
import { expect }			from 'chai';
import json				from '@whi/json';

import {
    expect_reject,
    linearSuite,
    cmd,
}					from '../utils.js';
import {
    main,
}					from '../../lib/index.js';


const APP_PORT				= 34_567;

describe("DevHub CLI (no holochain)", function () {
    linearSuite("Basic", basic_tests );
});


function basic_tests () {

    linearSuite("Errors", function () {

	it("should fail to open connection to Holochain", async function () {
	    await expect_reject(async () => {
		await main(
		    cmd(`-p ${APP_PORT} -a test-alice zomes list`)
		);
	    }, "Failed to open WebSocket");
	});

    });
}
