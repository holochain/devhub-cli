
import fs				from 'fs/promises';
import path				from 'path';

import chalk				from 'chalk';
import deepEqual			from 'deep-equal';
import { sprintf }			from 'sprintf-js';
import { execa }		        from 'execa';

import { Bytes }			from '@whi/bytes-class';


export function print ( msg, ...args ) {
    if ( print.quiet === true )
	return;
    console.log( chalk.whiteBright( sprintf(msg, ...args) ) );
}
print.quiet				= false;


export function parseHex ( hex ) {
    return Bytes.from(
	hex.match(/.{1,2}/g)
	    .map((byte) => parseInt(byte, 16))
    );
}


export function buildList ( value, list ) {
    if ( !Array.isArray(list) )
	list				= [];

    list.push( value );

    return list;
}


export async function fileExists ( file_path ) {
    try {
        await fs.access( file_path );
        return true;
    } catch (err) {
        return false;
    }
}

export async function readTextFile ( file_path ) {
    return await fs.readFile(
	path.resolve( file_path ),
	"utf-8",
    );
}

export async function readJsonFile ( file_path ) {
    return JSON.parse(
	await fs.readFile(
	    path.resolve( file_path ),
	    "utf-8",
	)
    );
}

export async function writeJsonFile ( file_path, data ) {
    return await fs.writeFile(
	file_path,
	JSON.stringify( data, null, 4 ) + "\n",
	"utf8",
    );
}


const encoder                           = new TextEncoder();
const decoder                           = new TextDecoder();

export function encodeText ( text ) {
    return encoder.encode( text );
}

export function decodeText ( bytes ) {
    return decoder.decode( bytes );
}


export function validate_port ( port ) {
    if ( typeof port === "string" )
	port				= parseInt( port );

    if ( isNaN(port) )
	throw new TypeError(`Not a number`);

    if ( port < 0 )
	throw new TypeError(`Port number is too low`);
    if ( port > 65_535 )
	throw new TypeError(`Port number is too high`);

    return true;
}

export function validate_token ( token ) {
    if ( !(token instanceof Uint8Array) )
	token				= parseHex( token );

    if ( token.length !== 64 )
	throw new TypeError(`Token should be 64 bytes`);

    return true;
}

export function validate_package_name ( name ) {
    if ( name.split("/").length > 2 )
        throw new Error(`Invalid package name '${name}'; slashes (/) can only be used to separate org names`);

    if ( name.split("#").length > 1 )
        throw new Error(`Invalid package name '${name}'; hashes (#) are reserved for indicating package versions`);
}

export function is_valid_port ( input ) {
    try {
	validate_port( input );
	return true;
    } catch (err) {
	return false;
    }
}

export function is_valid_token ( input ) {
    try {
	validate_token( input );
	return true;
    } catch (err) {
	return false;
    }
}


export function snakeToWords( str ) {
  return str
      .split('_')       // Split the string by underscores
      .map( word => {   // Capitalize first letter of each word
          return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(' ');       // Join the words with a space
}


export async function deriveCargoVersion ( cwd, required: boolean = true ) {
    const result                        = await execa(`cargo --version`, {
        "cwd":      cwd,
        "shell":    true,
    });

    const version                       = result.stdout.match(/cargo (\d+\.\d+\.\d+)/)?.[1];

    if ( !version && required === true )
        throw new Error(`Could not determine 'cargo' version; ${result.stdout}`);

    return version || null;
}

export async function deriveHdiVersionForCrate ( cwd, crate_name, required: boolean = true ) {
    const hdi_line                      = await execa(`cargo tree -p ${crate_name} | grep " hdi " | head -n 1`, {
        "cwd":      cwd,
        "shell":    true,
    });
    const cargo_hdi                     = hdi_line.stdout.match(/hdi v(.*)/)?.[1];

    if ( !cargo_hdi && required === true )
        throw new Error(`Could not determine 'hdi' version from cargo tree:\n${hdi_line.stdout}`);

    return cargo_hdi || null;
}

export async function deriveHdkVersionForCrate ( cwd, crate_name, required: boolean = true ) {
    const hdk_line                      = await execa(`cargo tree -p ${crate_name} | grep " hdk " | head -n 1`, {
        "cwd":      cwd,
        "shell":    true,
    });
    const cargo_hdk                     = hdk_line.stdout.match(/hdk v(.*)/)?.[1];

    if ( !cargo_hdk && required === true )
        throw new Error(`Could not determine 'hdk' version from cargo tree:\n${hdk_line.stdout}`);

    return cargo_hdk || null;
}

export async function deriveHolochainVersionForCrate ( cwd, required: boolean = true ) {
    const holochain_line                = await execa(`holochain --version`, {
        "cwd":      cwd, // Maybe this shouldn't be here?
        "shell":    true,
    });

    const holochain_version             = holochain_line.stdout.split(" ")[1];

    if ( !holochain_version && required === true )
        throw new Error(`Could not determine 'holochain' version from cwd ${cwd}`);

    return holochain_version || null;
}

export async function crateInfo ( cwd, crate_name ) {
    // Check if cargo is there
    await deriveCargoVersion( cwd );

    const result                        = await execa(`cargo metadata --format-version 1 2> /dev/null`, {
        "cwd":      cwd,
        "shell":    true,
    });
    const packages                      = JSON.parse( result.stdout ).packages;

    if ( !packages )
        return null;

    return packages.find( crate_info => crate_info.name === crate_name );
}


export function deepSubset( obj1, obj2 ) {
    for ( let key in obj2 ) {
        if ( typeof obj2[key] === 'object' && obj2[key] !== null ) {
            if ( !deepEqual( obj1[key], obj2[key] ) )
                return false;
        }
        else if ( obj1[key] !== obj2[key] )
            return false;
    }

    return true;
}


export default {
    print,
    parseHex,
    buildList,

    fileExists,
    readTextFile,
    readJsonFile,
    writeJsonFile,

    encodeText,
    decodeText,

    validate_port,
    validate_token,
    validate_package_name,

    is_valid_port,
    is_valid_token,

    snakeToWords,

    deriveCargoVersion,
    deriveHdiVersionForCrate,
    deriveHdkVersionForCrate,
    deriveHolochainVersionForCrate,
    crateInfo,

    deepEqual,
    deepSubset,
};
