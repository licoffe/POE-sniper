/* jshint node: true */
/* jshint jquery: true */
/* jshint esversion: 6 */
"use strict";

/**
 * FilterGroup class
 *
 * Holds a group of filters
 * @params Nothing
 * @return Filter Group object
 */

var mu   = require( "mu2" );
mu.root  = __dirname + '/templates';
var Misc = require( "./misc.js" );

class FilterGroup {

    constructor( obj ) {
        this.clipboard = obj.clipboard;
        this.name      = obj.name;
        this.checked   = obj.checked ? "checked" : "";
        this.color     = obj.color;
        this.filters   = {};
        this.id        = obj.id;
        this.folded    = obj.folded;
    }

    add( filter ) {
        this.filters[filter.id] = filter;
    }

    remove( filter ) {
        delete this.filters[filter.id];
    }

    getFilter( filterId ) {
        if ( this.filters[filterId]) {
            return this.filters[filterId];
        } else {
            return null;
        }
    }

    /**
     * Render the filter group to html using a template
     *
     * @params Callback
     * @return Generated HTML through callback
     */
    render( callback ) {
        var generated = "";
        mu.compileAndRender( "filter-group.html", this )
        .on( "data", function ( data ) {
            generated += data.toString();
        })
        .on( "end", function() {
            callback( generated );
        });
    }

}

module.exports = FilterGroup;