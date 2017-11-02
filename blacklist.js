/* jshint node: true */
/* jshint jquery: true */
/* jshint esversion: 6 */
"use strict";

/**
 * Blacklist class
 *
 * Manage a list of entries
 * @param Entry list
 * @return BlackList object
 */

var fs               = require( "fs" );
const {app}          = require( "electron" ).remote;
const path           = require( "path" );
var BlacklistedEntry = require( "./blacklisted-entry" );

class BlackList {
    constructor( blacklistName, entries ) {
        this.blacklistName = blacklistName;
        this.entries       = entries;
    }

    add( entry ) {
        this.entries[entry.factor] = new BlacklistedEntry( entry );
    }

    toggle( entry ) {
        this.entries[entry.factor].active = !this.entries[entry.factor].active;
    }

    revoke( entry ) {
        delete this.entries[entry.factor];
    }

    check( factor ) {
        if ( this.entries[factor] && this.entries[factor].active ) {
            return true;
        } else {
            return false;
        }
    }

    /**
     * Write the blacklist to disk
     *
     * @param Nothing
     * @return Nothing
     */
    save() {
        fs.writeFileSync( app.getPath( "userData" ) + path.sep + this.blacklistName + ".json", JSON.stringify( this ));
    }
}

module.exports = BlackList;