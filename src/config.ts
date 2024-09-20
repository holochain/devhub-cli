
import fs				from 'fs/promises';
import path				from 'path';

import json				from '@whi/json';
import inquirer				from 'inquirer';
import {
    Argument,
    Option,
}					from 'commander';
import {
    print,
    parseHex,
    buildList,

    validate_port,
    validate_token,

    is_valid_port,
    is_valid_token,

    readJsonFile,
    writeJsonFile,
}					from './utils.js';

import {
    TARGET_TYPES,
    ZOME_TYPES,
}					from './types.js';


export default function ({ program, action_context, auto_help }) {
    const subprogram			= program
	.command("config")
	.description("Manage devhub config")
	.action( auto_help );

    subprogram
        .command("add")
        .description("Add inline zome config")
        .addArgument(
            new Argument("<type>", "Config (target) type")
                .choices( TARGET_TYPES )
        )
        .argument("<target-id>", "Zome target identifier" )
        .argument("<path>", "Path to the zome target")
        .option("-f, --force", "Add target even if the file doesn't exist yet" )
        .action(
            action_context(async function ({
                log,
                project,
            }, target_type, target_id, target_config_path ) {
                const opts		= this.opts();

                const config		= await readJsonFile( project.configFilepath );
                const tconfig_abs_path	= path.resolve( target_config_path );

                if ( config?.zomes?.[ target_id ] && opts.force === false )
                    throw new Error(`There is already a zome target named '${target_id}'`);

                try {
                    await fs.access( tconfig_abs_path );
                } catch (err) {
                    if ( err.code === "ENOENT" )
                        throw new Error(`Zome target config '${tconfig_abs_path}' does not exist`);
                    else
                        throw err;
                }

                if ( !config.zomes )
                    config.zomes		= {};

                config.zomes[ target_id ]	= path.relative(
                    path.dirname( project.configFilepath ),
                    tconfig_abs_path
                );

                log.normal("Writing updated devhub config to %s", project.configFilepath );
                await writeJsonFile(
                    project.configFilepath,
                    config,
                );

                return config;
            }, false )
        );

    return program;
}
