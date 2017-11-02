/* jshint node: true */
/* jshint jquery: true */
/* jshint esversion: 6 */
"use strict";

/**
 * BlacklistedEntry class
 *
 * Represent a blacklisted entry
 * @param entry content
 * @return BlackListEntry object
 */

class BlacklistedEntry {
    constructor( obj ) {
        this.date   = Date.now();
        this.factor = obj.factor;
        this.reason = obj.reason;
        this.active = obj.active;
    }
}

module.exports = BlacklistedEntry;