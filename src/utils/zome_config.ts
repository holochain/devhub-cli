
import fs				from 'fs/promises';
import path				from 'path';
import cloneDeep			from 'clone-deep';

import {
    AgentPubKey,
}					from '@spartan-hc/holo-hash';
import {
    AppInterfaceClient,
}					from '@spartan-hc/app-interface-client';
import {
    ZomeHubCell,
}					from '@holochain/zomehub-zomelets';

import common				from '../utils.js';


export class ZomeConfig {
    #filepath               : string;
    #rel_filepath           : string;
    #root_filepath          : string;
    #config                 : any;
    #ready                  : Promise<void[]>;

    static async create ( rel_filepath, root_filepath ) {
        const config                = new ZomeConfig( rel_filepath, root_filepath );
        await config.ready();
        return config;
    }

    constructor (
        rel_filepath        : string,
        root_filepath       : string,
    ) {
        this.#rel_filepath          = rel_filepath;
        this.#root_filepath         = root_filepath;
        this.#filepath              = path.resolve(
            path.dirname( root_filepath ),
            rel_filepath,
        );

        this.#ready                 = Promise.all([
            this.loadFile(),
        ]);
    }

    get filepath () : string { return this.#filepath; }
    get rel_filepath () : string { return this.#rel_filepath; }
    get root_filepath () : string { return this.#root_filepath; }
    get config () : any { return this.#config; }

    ready () {
        return this.#ready;
    }

    async loadFile () {
        this.#config                = await common.readJsonFile( this.filepath );
    }

    // get creator () {
    //     return this.config.creator
    //         ? new AgentPubKey( this.config.creator )
    //         : null;
    // }

    get anchor () { return this.config.anchor; }
    get name () { return this.config.name; }
    get version () { return this.config.version; }
    get description () { return this.config.description; }

    get target () {
        return path.resolve(
            path.resolve(
	        path.dirname( this.root_filepath ),
		path.dirname( this.rel_filepath ),
            ),
	    this.config.target,
	);
    }

    get zome_type () { return this.config.zome_type; }
    get maintainer () { return this.config.maintainer; }
    get tags () { return this.config.tags; }
    get metadata () { return this.config.metadata; }

    toJSON () {
        return {
            "source":               this.filepath,
            "type":                 "zome",
            // "creator":              this.creator,
            "anchor":               this.anchor,
            "name":                 this.name,
            "version":              this.version,
            "description":          this.description,
            "target":               this.target,
            "zome_type":            this.zome_type,
            "maintainer":           this.maintainer,
            "tags":                 this.tags,
            "metadata":             this.metadata,
        };
    }
}


export default ZomeConfig;