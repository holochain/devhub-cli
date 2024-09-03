
import { Logger }			from '@whi/weblogger';
import { Command }			from 'commander';
import {
    ActionHash,
}					from '@spartan-hc/holo-hash';
import {
    AppInterfaceClient,
    AppClient,
}					from '@spartan-hc/app-interface-client';

import type {
    Project,
}                                       from './utils/project.js';


export type Option<T> = T | null;

export type ConnectionContext = {
    app_port		: number;
    app_token		: Uint8Array;
};

export type DevhubConfig = {
    app_port	       ?: number;
    app_token	       ?: string;
    zomes	       ?: Record<string, ZomeTarget>;
};

export type ZomeTarget = {
    zome_package_id	       ?: string | ActionHash | null;
    zome_package_version_id    ?: string | ActionHash | null;
    type			: string;
    version			: string;
    target			: string;
    anchor			: string;
    name			: string;
    description			: string;
    zome_type			: string;
    maintainer			: any;
    tags			: Array<string>;
    metadata			: any;
};

export type DevhubSettings = Partial<ConnectionContext> & {
    zomes		: Record<string, ZomeTarget>;
};


export const TARGET_TYPES		= [
    "zome",
    "dna",
    "happ",
    "webhapp",
] as const;

export type TargetTypes = typeof TARGET_TYPES[number];


export const ZOME_TYPES			= [
    "integrity",
    "coordinator",
] as const;

export type ZomeTypes = typeof ZOME_TYPES[number];


export type ActionContextFunction = (
    action_callback		: ActionCallbackFunction,
    connected		       ?: boolean,
) => any;

export type ActionCallbackInput = {
    log				: any;

    project		        : Project;

    connection_ctx		: ConnectionContext;
    devhub_config_path		: string;
    devhub_confi		: DevhubConfig;
    devhub_settings		: DevhubSettings;

    client			: AppInterfaceClient;
    app_client			: AppClient;
    zomehub			: any;
    zomehub_csr			: any;
    mere_memory_api		: any;
};
export type ActionCallbackFunction = (
    action_callback		: ActionCallbackInput,
    ...args			: any[]
) => Promise<any>;


export type SubprogramInitInput = {
    program			: Command;
    action_context		: ActionContextFunction;
    auto_help			: () => Promise<void>;
    devhub_config		: DevhubConfig;
};
export type SubprogramInitFunction = ( SubprogramInitInput ) => Promise<any>;
