
import fs				from 'fs/promises';
import path				from 'path';

import toml				from 'toml';
import chalk				from 'chalk';
import inquirer				from 'inquirer';
import semver				from 'semver';
import {
    Argument,
    Option,
}					from 'commander';
import json				from '@whi/json';

import { main }                         from './index.js';
import {
    ZomeTarget,
    SubprogramInitInput,
    SubprogramInitFunction,
    ZOME_TYPES,
}					from './types.js';
import {
    buildList,

    readJsonFile,
    writeJsonFile,

    snakeToWords,
}					from './utils.js';


const init : SubprogramInitFunction = async function (
    {
	program,
	action_context,
	auto_help,
	devhub_config
    } : SubprogramInitInput,
) {
    const subprogram			= program
	.command("orgs").alias("org")
	.description("Manage orgs")
	.action( auto_help );

    const list_subprogram               = subprogram
	.command("list")
	.description("List my orgs")
	.action(
	    action_context(async function ({
		log,
                project,
	    }) {
		const opts		= this.opts();
		const root_opts	        = program.opts();

                const orgs              = await project.zomehub_client.get_my_orgs();

                if ( root_opts.data === true ) {
                    return orgs.map( org => {
                        org.group       = org.group.toJSON(true);
                        return org;
                    });
                }

                return orgs.map( org => {
                    const group         = org.group;
                    return [
                        chalk.white(`@${org.name} `) + chalk.gray(`(${group.$id})`),
                        chalk.cyan(`  Admins:`),
                        ...group.admins.map( agent => chalk.cyan(`    ${agent}`) ),
                        chalk.yellow(`  Members:`),
                        ...group.members.length
                            ? group.members.map( agent => chalk.yellow(`    ${agent}`) )
                            : [ chalk.yellow("    No members") ],
                    ].join("\n");
                }).join("\n\n");
	    })
	);

    list_subprogram
	.command("packages")
	.description("List my orgs")
	.argument("<name>", "Org name")
	.action(
	    action_context(async function ({
		log,
                project,
	    }, org_name ) {
		const opts		= this.opts();
		const root_opts	        = program.opts();

                const group             = await project.zomehub_client.get_group_by_name( org_name );
                const zome_packages     = await project.zomehub_client.get_zome_packages_for_group( group.$id );

		const packages		= [] as any[];

		for ( let [entity_id, zome_package] of Object.entries( zome_packages ) ) {
		    packages.push( zome_package );
		}

                if ( root_opts.data === true )
                    return packages;

                return packages.map( zome_package => {
                    return [
                        `${chalk.white(zome_package.name)} ` + chalk.gray(`(${zome_package.$id})`),
                        chalk.cyan(`  [${zome_package.zome_type}] ${zome_package.title}`),
                        `  ${zome_package.description}`,
                    ].join("\n");
                }).join("\n\n");
            })
        );

    const add_subprogram		= subprogram
	.command("add")
	.description("Add a member to org")
	.argument("<name>", "Org name")
	.argument("<agent>", "Agent pubkey of new member")
        .option("--admin", "Add member with admin privilegs", false )
	.action(
	    action_context(async function ({
		log,
                project,
	    }, org_name, agent ) {
		const opts		= this.opts();
		const root_opts	        = program.opts();

                const group             = await project.zomehub_client.get_group_by_name( org_name );

                if ( !group.isAdmin( project.cell_agent ) )
                    throw new Error(`You do not have admin privileges in the '@${org_name}' group (${group.$id})`);

                if ( opts.admin === true ) {
                    await project.coop_content_client.add_admin({
                        "group_id":     group.$id,
                        "agent":        agent,
                    });
                }
                else {
                    await project.coop_content_client.add_member({
                        "group_id":     group.$id,
                        "agent":        agent,
                    });
                }

                return await project.coop_content_client.get_group( group.$id );
	    })
	);

    const remove_subprogram		= subprogram
	.command("remove")
	.description("Remove a member from org")
	.argument("<name>", "Org name")
	.argument("<agent>", "Agent pubkey to be removed")
        .option("--admin", "Add member with admin privilegs", false )
	.action(
	    action_context(async function ({
		log,
                project,
	    }, org_name, agent ) {
		const opts		= this.opts();
		const root_opts	        = program.opts();

                const group             = await project.zomehub_client.get_group_by_name( org_name );

                if ( !group.isAdmin( project.cell_agent ) )
                    throw new Error(`You do not have admin privileges in the '@${org_name}' group (${group.$id})`);

                if ( opts.admin === true ) {
                    await project.coop_content_client.remove_admin({
                        "group_id":     group.$id,
                        "agent":        agent,
                    });
                }
                else {
                    await project.coop_content_client.remove_member({
                        "group_id":     group.$id,
                        "agent":        agent,
                    });
                }

                return await project.coop_content_client.get_group( group.$id );
	    })
	);

    return subprogram;
}

export default init;
