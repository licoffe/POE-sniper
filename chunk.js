/* jshint node: true */
/* jshint jquery: true */
/* jshint esversion: 6 */
"use strict";

/**
 * Chunk class
 *
 * Download, check last downloaded chunk
 * @params Nothing
 * @return Chunk object
 */

var fs               = require( "fs" );
var request          = require( "request" );

class Chunk {

    /**
     * Parse JSON and send it to callback
     *
     * @params Data to parse, callback
     * @return Send parsed JSON to callback
     */
    static loadJSON( data, chunkID, callback ) {
        try {
            data = JSON.parse( data, 'utf8' );
            // If we reached the top and next_change_id is null
            if ( !data.next_change_id ) {
                console.log( "Top reached, waiting" );
            } else {
                callback( data );
            }
        } catch ( e ) {
            console.log( "Error occured, retrying: " + e );
        }
    }
}

module.exports = Chunk;