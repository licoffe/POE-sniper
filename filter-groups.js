/**
 * FilterGroups class
 *
 * List of Group representation
 * @params Nothing
 * @return FilterGroups object
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


class FilterGroups {

    constructor( groupList ) {
        this.groupList = groupList;
        this.length    = groupList.length;
        this.sort();
    }

    /**
     * Sort group list alphabetically
     *
     * @params Nothing
     * @return Groups in place
     */
    sort() {
        this.groupList.sort( function( a, b ) {
            var alc = a.name.toLowerCase();
            var blc = b.name.toLowerCase();
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
     * Activate/deactivate group
     *
     * @params Group id, callback
     * @return Nothing
     */
    toggle( id, callback ) {
        var self = this;
        async.each( this.groupList, function( group, cbFilter ) {
            if ( group.id === id ) {
                group.checked = group.checked === "checked" ? "" : "checked"
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
     * Add a new group to the group list
     *
     * @params Group object to add
     * @return Nothing
     */
    add( group ) {
        this.groupList.push( group );
        this.length = this.groupList.length;
        this.sort();
    }

    /**
     * Remove a group from the group list
     *
     * @params The group id corresponding to the group to be removed, callback
     * @return Nothing
     */
    remove( groupId, callback ) {
        var self = this;
        var groups = [];
        async.each( this.groupList, function( group, cbGroup ) {
            if ( group.id !== groupId ) {
                groups.push( group );
                cbGroup();
            } else {
                cbGroup();
            }
        }, function( err ) {
            if ( err ) {
                console.log( err );
            }
            self.groupList = groups;
            self.length    = self.groupList.length;
            self.sort();
            callback();
        });
    }

    /**
     * Update group inside group list
     *
     * @params Group to find and replace
     * @return Callback
     */
    update( groupToFind, callback ) {
        var self = this;
        var groups = [];
        async.each( this.groupList, function( group, cbGroup ) {
            if ( group.id === groupToFind.id ) {
                groups.push( groupToFind );
                cbGroup();
            } else {
                groups.push( group );
                cbGroup();
            }
        }, function( err ) {
            if ( err ) {
                console.log( err );
            }
            self.groupList = groups;
            self.sort();
            callback();
        });
    }

    /**
     * Return the group associated to input id
     *
     * @params Group ID
     * @return Group object through callback
     */
    find( groupId, callback ) {
        var found = null;
        async.each( this.groupList, function( group, cbGroup ) {
            if ( group.id === groupId ) {
                found = group;
            }
            cbGroup();
        }, function() {
            callback( found );
        });
    }

    /**
     * Write the group list to disk
     *
     * @params Nothing
     * @return Nothing
     */
    save() {
        fs.writeFileSync( app.getPath( "userData" ) + path.sep + "filter-groups.json", JSON.stringify( this.groupList ));
    }
}

module.exports = FilterGroups;