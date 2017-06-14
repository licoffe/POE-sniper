/**
 * Filters class
 *
 * List of Filter representation
 * @params Nothing
 * @return Filters object
 */

var async  = require( "async" );
var fs     = require( "fs" );
var config = require( "./config.json" );

class Filters {

    constructor( filterList ) {
        this.filterList = filterList;
        this.length     = filterList.length;
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
        fs.writeFile( __dirname + "/filters.json", JSON.stringify( this.filterList ), function( err ) {
            if ( err ) {
                return console.log( err );
            }
        });
    }

    // check( item ) {
    //     var matched = [];
    //     async.each( this.filterList, function( filter, cbFilter ) {
    //         if ( filter.check ) {
    //             matched.push( item );
    //             cbFilter();
    //         } else {
    //             cbFilter();
    //         }
    //     });
    // }

}

module.exports = Filters;