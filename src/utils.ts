
import chalk				from 'chalk';
import { sprintf }			from 'sprintf-js';


export function print ( msg, ...args ) {
    if ( print.quiet === true )
	return;
    console.log( chalk.whiteBright( sprintf(msg, ...args) ) );
}
print.quiet				= false;
