import { Logger }			from '@whi/weblogger';
const log				= new Logger("project", process.env.LOG_LEVEL );

import os				from 'os';
import fs				from 'fs/promises';
import path				from 'path';
import cloneDeep			from 'clone-deep';

import {
    ActionHash,
}					from '@spartan-hc/holo-hash';
import {
    AppInterfaceClient,
}					from '@spartan-hc/app-interface-client';
import {
    ZomeHubCell,
}					from '@holochain/zomehub-zomelets';

import common				from '../utils.js';
import {
    Option,
    DevhubSettings,
    ConnectionContext,
}                                       from '../types.js';
import ZomeConfig			from './zome_config.js';


const DEFAULT_USER_HOME_DIRNAME     = process.env.HOME || os.homedir();
const DEFAULT_DEVHUB_HOME_DIRNAME   = process.env.DEVHUB_HOME || `.devhub`;

const DEFAULT_CONNECTION_FILEPATH   = `connection.json`;
const DEFAULT_CONFIG_FILEPATH       = `devhub.json`;
const DEFAULT_LOCK_FILEPATH         = `devhub-lock.json`;

const DEFAULT_LOCKFILE              = {
    "version":          1,
    "zomes":            {},
};


export class Project {
    #cwd                : string;
    #connection         : Option<ConnectionContext>;
    #config_raw         : Option<any>;
    #config             : Option<DevhubSettings>;
    #lock_raw           : Option<any>;
    #ready              : Promise<void>;

    #client             : any;
    #app_client         : any;
    #zomehub_zomelet    : any;
    #zomehub_client     : any;
    #mere_memory_client : any;

    USER_HOME_DIRNAME   : string        = DEFAULT_USER_HOME_DIRNAME;
    HOME_DIRNAME        : string        = DEFAULT_DEVHUB_HOME_DIRNAME;
    CONNECTION_FILEPATH : string        = DEFAULT_CONNECTION_FILEPATH;
    CONFIG_FILEPATH     : string        = DEFAULT_CONFIG_FILEPATH;
    LOCK_FILEPATH       : string        = DEFAULT_LOCK_FILEPATH;

    static async create ( cwd, opts? ) {
        const project               = new Project( cwd, opts );
        await project.ready();
        return project;
    }

    constructor ( cwd : string, opts : any = {} ) {
        this.#cwd                   = cwd;

        if ( opts.user_homedir )
            this.USER_HOME_DIRNAME      = opts.user_homedir;

        this.#ready                 = this.load();
    }

    get cwd () : string { return this.#cwd; }
    get connection () { return this.#connection; }
    get config_raw () { return this.#config_raw; }
    get config () { return this.#config; }
    get lock () { return this.#lock_raw; }

    // TODO: a single indicator is not enough because the connection and project states can change
    // independently.  Eg. CONNECTED + NO_CONFIG
    get state () {
        if ( this.config )
            return "CONFIGURED";
        return "NO_CONFIG";
    }

    get connectionState () {
        if ( this.zomehub_client )
            return "CONNECTED";
        if ( this.client )
            return "CONNECTION_FAILED";
        if ( this.connection )
            return "UNCONNECTED";
        return "NO_CONNECTION_INFO";
    }

    get homedir () : string {
        return path.resolve( this.cwd, this.HOME_DIRNAME );
    }

    get globalHomedir () : string {
        return path.resolve( this.USER_HOME_DIRNAME, this.HOME_DIRNAME );
    }

    get configFilepath () : string {
        return path.resolve( this.cwd, this.CONFIG_FILEPATH );
    }
    get lockFilepath () : string {
        return path.resolve( this.cwd, this.LOCK_FILEPATH );
    }

    ready () {
        return this.#ready;
    }

    async ensureGlobalHomedir () {
        log.info("Create devhub global homedir: %s", this.globalHomedir );
        await fs.mkdir( this.globalHomedir, {
            "recursive":    true,
        });
    }

    async ensureHomedir () {
        log.info("Create devhub homedir: %s", this.homedir );
        await fs.mkdir( this.homedir, {
            "recursive":    true,
        });
    }

    async init () {
        await common.writeJsonFile(
            this.configFilepath,
            {
                "version": "1",
                // TODO: fields for project info
                "zomes":    {},
                // "dnas":     {},
                // "happs":    {},
                // "webhapps": {},
            }
        );
        await this.loadConfigFile();
    }

    async load () {
        return await this.reload();
    }

    async reload () {
        await Promise.all([
            this.loadConnectionFile(),
            this.loadConfigFile(),
            this.loadLockFile(),
        ]);
    }

    async loadConfigFile () {
        try {
            this.#config_raw        = await common.readJsonFile( this.configFilepath );
        } catch (err) {
            if ( err.code !== "ENOENT" )
                throw err;
            this.#config_raw        = null;
            this.#config            = null;
            return;
        }

        const config                = cloneDeep( this.#config_raw );

        await Promise.all([
            ...Object.entries(config.zomes).map( async ([zid, filepath]) => {
	        config.zomes[ zid ] = await ZomeConfig.create( filepath, this.configFilepath );
            }),
        ]);

        this.#config                = config;
    }

    async saveConfig () {
        await common.writeJsonFile(
            this.configFilepath,
            this.config_raw,
        );
    }

    async saveLock () {
        await common.writeJsonFile(
            this.lockFilepath,
            this.#lock_raw,
        );
    }

    async loadLockFile () {
        try {
            this.#lock_raw          = await common.readJsonFile( this.lockFilepath );
        } catch (err) {
            if ( err.code !== "ENOENT" )
                throw err;
            this.#lock_raw          = cloneDeep( DEFAULT_LOCKFILE );
        }

        return this.lock;
    }

    async addZome ( tid, config_filepath ) {
        if ( !this.config )
            throw new Error(`Devhub config not found`);

        if ( this.config_raw.zomes[ tid ] !== undefined )
            throw new Error(`Target ID '${tid}' is already defined`);

        this.config_raw.zomes[ tid ]    = path.relative(
            this.cwd,
            path.resolve(
                this.cwd,
                config_filepath,
            ),
        );

        await this.saveConfig();
        await this.loadConfigFile();

        return this.config.zomes[ tid ];
    }


    //
    // Display Management
    //
    toJSON () {
        const config                = cloneDeep( this.config );

        if ( config ) {
            for ( let tid in config.zomes ) {
                config.zomes[ tid ]     = { ...config.zomes[ tid ].toJSON() };

                const zome_config       = config.zomes[ tid ];

                zome_config.source      = path.relative(
                    this.cwd,
                    zome_config.source,
                );
                zome_config.target      = path.relative(
                    this.cwd,
                    zome_config.target,
                );
            }
        }

        return {
            "state":                        this.state,
            "connection_state":             this.connectionState,
            "root":                         this.cwd,
            "homedir":                      this.homedir,
            "connection_filepath":          this.connectionFilepath,
            "config_filepath":              this.configFilepath,
            "global_homedir":               this.globalHomedir,
            "global_connection_filepath":   this.globalConnectionFilepath,
            "connection":                   this.connection,
            "config_raw":                   this.config_raw,
            "config":                       config,
        };
    }


    //
    // Connection Management
    //
    get globalConnectionFilepath () : string {
        return path.resolve( this.globalHomedir, this.CONNECTION_FILEPATH );
    }

    get connectionFilepath () : string {
        return path.resolve( this.homedir, this.CONNECTION_FILEPATH );
    }

    async loadConnectionFile () {
        // Try local config first
        try {
            this.#connection        = await common.readJsonFile( this.connectionFilepath );
            return;
        } catch (err) {
            if ( err.code !== "ENOENT" )
                throw err;
            this.#connection        = null;
        }

        // Check global config
        try {
            this.#connection        = await common.readJsonFile( this.globalConnectionFilepath );
        } catch (err) {
            if ( err.code !== "ENOENT" )
                throw err;
            this.#connection        = null;
        }
    }

    get client () { return this.#client };
    get app_client () { return this.#app_client };
    get zomehub_zomelet () { return this.#zomehub_zomelet };
    get zomehub_client () { return this.#zomehub_client };
    get mere_memory_client () { return this.#mere_memory_client };

    async setConnection ({ app_port, app_token }, opts : any = {} ) {
        const connection            = {
            app_port,
            app_token,
        };
        const filepath              = opts.global
            ? this.globalConnectionFilepath
            : this.connectionFilepath;

        if ( opts.global === true ) {
            await this.ensureGlobalHomedir();
        } else {
            await this.ensureHomedir();
        }

        log.info("Writing connection info to %s", filepath );
        await common.writeJsonFile(
            filepath,
            connection,
        );
        await this.loadConnectionFile();
    }

    async connect () {
        if ( !this.client )
            this.createClient();

        if ( !this.app_client )
            await this.createAppClient();

        if ( !this.zomehub_client )
            this.createZomehubClient();

        if ( !this.mere_memory_client )
            this.createMereMemoryClient();
    }

    createClient () {
        if ( !this.connection )
            throw new Error("No connection settings");
	this.#client                = new AppInterfaceClient( this.connection?.app_port, {
	    "logging":	"fatal",
	    "conn_options": {
		// "timeout":	opts.timeout,
	    },
	});
    }

    async createAppClient () {
        if ( !this.client )
            throw new Error("Client has not been created yet");
        const token                 = common.parseHex( this.connection?.app_token );
	this.#app_client            = await this.client.app( token );
    }

    createZomehubClient () {
        if ( !this.app_client )
            throw new Error("App client has not been created yet");
        const {
            zomehub,
        }                           = this.app_client.createInterface({
	    "zomehub":      ZomeHubCell,
	});

        this.#zomehub_zomelet       = zomehub;
        this.#zomehub_client        = zomehub.zomes.zomehub_csr.functions;
    }

    createMereMemoryClient () {
        if ( !this.zomehub_client )
            throw new Error("ZomeHub client has not been created yet");
        this.#mere_memory_client    = this.zomehub_zomelet.zomes.mere_memory_api.functions;
    }
}


export default {
    Project,
};
