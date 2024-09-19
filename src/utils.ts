
import fs				from 'fs/promises';
import path				from 'path';

import chalk				from 'chalk';
import { sprintf }			from 'sprintf-js';

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


export default {
    print,
    parseHex,
    readJsonFile,
    writeJsonFile,

    validate_port,
    validate_token,

    is_valid_port,
    is_valid_token,

    snakeToWords,
};
