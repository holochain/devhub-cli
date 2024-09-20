import { Logger }			from '@whi/weblogger';
const log				= new Logger("test-basic", process.env.LOG_LEVEL );

import path				from 'path';
import { expect }			from 'chai';
import json				from '@whi/json';

import {
    linearSuite,
    tmpdir,
}					from '../utils.js';
import {
    Project,
}					from '../../lib/utils/project.js';


const TMPDIR                            = await tmpdir();
const PROJECT_OPTS                      = {
    "user_homedir":     path.dirname( TMPDIR ),
};


describe("Project class", function () {
    linearSuite("Basic", basic_tests );
});


function basic_tests () {
    it("should create a project instance", async function () {
        const project                   = new Project( TMPDIR, PROJECT_OPTS );
        await project.load();

        log.normal("Project %s", json.debug(project) );
        expect( project.cwd             ).to.equal( TMPDIR, PROJECT_OPTS );
        expect( project.state           ).to.equal( "NO_CONFIG" );
        expect( project.connectionState ).to.equal( "NO_CONNECTION_INFO" );
    });

    it("should init project", async function () {
        const project                   = new Project( TMPDIR, PROJECT_OPTS );
        await project.load();
        expect( project.state           ).to.equal( "NO_CONFIG" );
        expect( project.connectionState ).to.equal( "NO_CONNECTION_INFO" );

        await project.init();

        expect( project.state           ).to.equal( "CONFIGURED" );
        expect( project.connectionState ).to.equal( "NO_CONNECTION_INFO" );
    });

    it("should set connection", async function () {
        const project                   = new Project( TMPDIR, PROJECT_OPTS );
        await project.load();
        expect( project.state           ).to.equal( "CONFIGURED" );
        expect( project.connectionState ).to.equal( "NO_CONNECTION_INFO" );

        await project.setConnection({
            "app_port":     1234,
            "app_token":    "bee0d2978f5d7c233254e3addd62b9f8cd43221324771437c9f967b7991b6df5c1b6a96534bad77b20bee5416aa24f943bac033b3ba36428d53d3d00f9f36c36",
        });

        expect( project.state           ).to.equal( "CONFIGURED" );
        expect( project.connectionState ).to.equal( "UNCONNECTED" );

        log.normal("Project %s", json.debug(project) );
    });

    // linearSuite("Errors", function () {

    //     it("should fail to open connection to Holochain", async function () {
    //     });

    // });
}
