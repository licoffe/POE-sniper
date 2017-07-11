/**
 * Filters class
 *
 * List of Filter representation
 * @params Nothing
 * @return Filters object
 */

var async   = require( "async" );
var fs      = require( "fs" );
const {app} = require( "electron" ).remote;
const path  = require( "path" );
var config  = {};
// Check if config.json exists in app data, otherwise create it from default
// config file.
console.log( "Loading config from " + app.getPath( "userData" ) + path.sep + "config.json" );
config = require( app.getPath( "userData" ) + path.sep + "config.json" );


class Filters {

    constructor( filterList ) {
        this.filterList = filterList;
        this.length     = filterList.length;
        this.sort();
    }

    /**
     * Sort filter list alphabetically
     *
     * @params Nothing
     * @return Filters in place
     */
    sort() {
        this.filterList.sort( function( a, b ) {
            var alc = a.item.toLowerCase();
            var blc = b.item.toLowerCase();
            if ( alc < blc ) {
                return -1;
            } else if ( alc > blc ) {
                return 1;
            } else {
                return 0;
            }
        });
    }

    /**
     * Activate/deactivate filter
     *
     * @params Filter id, callback
     * @return Nothing
     */
    toggle( id, callback ) {
        var self = this;
        async.each( this.filterList, function( filter, cbFilter ) {
            if ( filter.id === id ) {
                filter.active = !filter.active;
                // console.log( "Toggled filter " + filter.item );
            }
            cbFilter();
        }, function( err ) {
            if ( err ) {
                console.log( err );
            }
            callback();
        });
    }

    /**
     * Find the sorted index of a specific filter in the lsit
     *
     * @params Filter to be found
     * @return Index through callback
     */
    findFilterIndex( filter, callback ) {
        var self = this;
        var index = 0;
        var found = false;
        async.each( this.filterList, function( f, cbFilter ) {
            if ( !found && JSON.stringify( filter ) === JSON.stringify( f )) {
                found = true;
            }
            if ( !found ) {
                index++;
            }
            cbFilter();
        }, function( err ) {
            if ( err ) {
                console.log( err );
            }
            callback({ found: found, index: index });
        });
    }

    /**
     * Add a new filter to the filter list
     *
     * @params Filter object to add
     * @return Nothing
     */
    add( filter ) {
        this.filterList.push( filter );
        this.length = this.filterList.length;
        this.sort();
    }

    /**
     * Remove a filter from the filter list
     *
     * @params The filter id corresponding to the filter to be removed, callback
     * @return Nothing
     */
    remove( filterId, callback ) {
        var self = this;
        var filters = [];
        async.each( this.filterList, function( filter, cbFilter ) {
            if ( filter.id !== filterId ) {
                filters.push( filter );
                cbFilter();
            } else {
                cbFilter();
            }
        }, function( err ) {
            if ( err ) {
                console.log( err );
            }
            self.filterList = filters;
            self.length     = filterList.length;
            self.sort();
            callback();
        });
    }

    /**
     * Update filter inside filter list
     *
     * @params Filter to find and replace
     * @return Callback
     */
    update( filterToFind, callback ) {
        var self = this;
        var filters = [];
        async.each( this.filterList, function( filter, cbFilter ) {
            if ( filter.id === filterToFind.id ) {
                filters.push( filterToFind );
                cbFilter();
            } else {
                filters.push( filter );
                cbFilter();
            }
        }, function( err ) {
            if ( err ) {
                console.log( err );
            }
            self.filterList = filters;
            self.sort();
            callback();
        });
    }

    /**
     * Write the filter list to disk
     *
     * @params Nothing
     * @return Nothing
     */
    save() {
        fs.writeFile( app.getPath( "userData" ) + path.sep + "filters.json", JSON.stringify( this.filterList ), function( err ) {
            if ( err ) {
                console.log( err );
            }
        });
    }
}

module.exports = Filters;