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
    it("should run main", async function () {
	const result                    = await main(
	    cmd(`--cwd /tmp -p ${APP_PORT} -a test-alice zomes list`, 4 )
	);

        log.normal("Zomes list:", result );
    });
}
