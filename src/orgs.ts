
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
	.description("List orgs")
        .option("--me", "List only my groups", false )
        .option("-l, --limit <number>", "Full org info limit", parseInt, 20 )
        .argument("[search]", "Filter packages by search phrase")
	.action(
	    action_context(async function ({
		log,
                project,
	    }, search ) {
		const opts		= this.opts();
		const root_opts	        = program.opts();

		const org_map           = {} as Record<string, any>;
		let search_list	        = [] as any[];

                // Create package list from source
                if ( opts.me === true ) {
                    const orgs          = await project.zomehub_client.get_my_orgs();

		    for ( let org of orgs ) {
		        search_list.push({
                            "name":     org.name,
                            "index":    org.name.toLowerCase(),
                        });
                        org_map[org.name]  = org;
		    }
                }
                else {
		    const links	        = await project.zomehub_client.get_all_org_group_links();

		    for ( let link of links ) {
                        const name      = link.tagString();
		        search_list.push({
                            "name":     name,
                            "index":    name.toLowerCase(),
                        });
                        org_map[name]   = link;
                    }
                }

                if ( search ) {
                    search_list         = search_list.filter( ({ index }) => {
                        return index.includes( search.toLowerCase() );
                    });
                }

                // Remove duplicates
                const org_names         = [] as string[];
                search_list             = search_list.filter( ({ name }) => {
                    if (  org_names.includes( name ) )
                        return false;

                    org_names.push( name );

                    return true;
                });

                // Avoid fetching all org's info if list is too long
                if ( search_list.length > opts.limit ) {
                    const org_list          = search_list.map( ({ name }) => {
                        const org_info      = org_map[ name ];

                        return org_info;
                    });

                    if ( root_opts.data === true )
                        return org_list;

                    // Org list could still be just a link at this point
                    return org_list.map( org_info => {
                        const name          = org_info.name || org_info.tagString();
                        return chalk.white(`@${name}`);
                    }).join("\n\n");
                }

                // Fetch remaining zome orgs
                const orgs                  = [] as any[];

                for ( let { name, index } of search_list ) {
                    const org_info          = org_map[ name ];

                    if ( org_info.target )
                        orgs.push({
                            name,
                            "group": await project.coop_content_client.get_group( org_info.target ),
                        });
                    else
                        orgs.push( org_info );
                }

                if ( root_opts.data === true )
                    return orgs;

                return orgs.map( org => {
                    const group             = org.group;
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

    const invites_subprogram               = subprogram
	.command("invites")
	.description("List my invitations to orgs")
	.action(
	    action_context(async function ({
		log,
                project,
	    }) {
		const opts		= this.opts();
		const root_opts	        = program.opts();

                const orgs              = await project.zomehub_client.get_my_org_invites();

                if ( root_opts.data === true )
                    return orgs;

                return orgs.map( org => {
                    const group         = org.invite.group;
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

    invites_subprogram
	.command("accept")
	.description("Accept an org invitation")
	.argument("<name>", "Org name")
	.action(
	    action_context(async function ({
		log,
                project,
	    }, org_name ) {
                return await project.zomehub_client.accept_invitation_to_group( org_name );
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

    subprogram
	.command("add")
	.description("Add org to my orgs")
	.argument("<name>", "Org name")
        .option("-f, --force", "Ignore org membership check", false )
	.action(
	    action_context(async function ({
		log,
                project,
	    }, org_name ) {
		const opts		= this.opts();
		const root_opts	        = program.opts();

                const group             = await project.zomehub_client.get_group_by_name( org_name );

                if ( opts.force === false && !group.isContributor( project.cell_agent ) )
                    throw new Error(`You are not a contributor to '@${org_name}' group (${group.$id})`);

                return await project.zomehub_client.create_named_group_link([
                    org_name,
                    group.$id,
                ]);
	    })
	);

    subprogram
	.command("remove")
	.description("Remove org from my orgs")
	.argument("<name>", "Org name")
	.allowExcessArguments( false )
	.action(
	    action_context(async function ({
		log,
                project,
	    }, org_name ) {
		const opts		= this.opts();
		const root_opts	        = program.opts();

                if ( !org_name.startsWith("@") )
                    org_name            = `@${org_name}`;

                const orgs              = await project.zomehub_client.get_my_orgs();

                if ( !orgs.find( org => org.name === org_name.slice(1) ) )
                    throw new Error(`Org '${org_name}' is not in your orgs list`);

                return await project.zomehub_client.remove_named_group_link( org_name );
	    })
	);

    subprogram
	.command("add-member")
	.description("Add a member to org")
	.argument("<name>", "Org name")
	.argument("<agent>", "Cell agent pubkey of new member")
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

    subprogram
	.command("remove-member")
	.description("Remove a member from org")
	.argument("<name>", "Org name")
	.argument("<agent>", "Cell agent pubkey to be removed")
        .option("--admin", "Add member with admin privilegs", false )
	.allowExcessArguments( false )
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
