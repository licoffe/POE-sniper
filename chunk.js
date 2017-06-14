/**
 * Chunk class
 *
 * Download, check last download chunk
 * @params Nothing
 * @return Chunk object
 */

var fs               = require( "fs" );
var request          = require( "request" );
var dns              = require( "dns" ),
dnscache             = require( "dnscache" )({
    "enable" : true,
    "ttl" : 300,
    "cachesize" : 1000
});
var config = require( "./config.json" );

class Chunk {

    /**
     * Get last change id from the poe-rates API
     *
     * @param callback
     * @return Next change ID through callback
     */
    static getLastChangeId( callback ) {
        request({ "url": "http://poe-rates.com/actions/getLastChangeId.php", "gzip": true },
            function( error, response, body ) {
                if ( error ) {
                    console.log( "Error occured, retrying: " + error );
                    setTimeout( Chunk.getLastChangeId, 1000, callback );
                } else {
                    var data = JSON.parse( body, 'utf8' );
                    callback( data.changeId );
                }
            }
        );
    };

    /**
     * Download compressed gzip change data
     *
     * @params Chunk ID, callback
     * @return unparsed JSON body through callback
     */
    static download( chunkID, callback ) {
        console.time( "Downloading chunk " + chunkID );
        var begin = Date.now();
        var dataSize = 0;
        var chunkStats;
        dnscache.lookup( "www.pathofexile.com", function( err, result ) {
            request({ "url": "http://www.pathofexile.com/api/public-stash-tabs?id=" + chunkID, "gzip": true },
                function( error, response, body ) {
                    // If there is an error, retry dowloading after delay
                    if ( error ) {
                        console.timeEnd( "Downloading chunk " + chunkID );
                        console.log( "Error occured, retrying: " + error );
                        var end = Date.now();
                        if ( config.writeChunkStats ) {
                            chunkStats = chunkID + "," + ( end - begin ) + "," + dataSize + ",failed\n";
                            writeChunkStats( chunkStats );
                        }
                        setTimeout( Chunk.download, config.CHUNK_RETRY_INTERVAL, chunkID, callback );
                    } else {
                        var end = Date.now();
                        console.timeEnd( "Downloading chunk " + chunkID );
                        if ( config.writeChunkStats ) {
                            chunkStats = chunkID + "," + ( end - begin ) + "," + dataSize + ",passed\n";
                            writeChunkStats( chunkStats );
                        }
                        Chunk.loadJSON( body, chunkID, callback );
                    }
                }
            ).on( "response", function( response ) {
                response.on( "data", function( data ) {
                    dataSize += data.length;
                });
            });
        });
    }

    /**
     * Parse JSON and send it to callback
     *
     * @params Data to parse, callback
     * @return Send parsed JSON to callback
     */
    static loadJSON( data, chunkID, callback ) {
        // try {
            data = JSON.parse( data, 'utf8' );
            // If we reached the top and next_change_id is null
            if ( !data.next_change_id ) {
                console.log( "Top reached, waiting" );
                setTimeout( Chunk.download, config.STREAM_TOP_WAIT_INTERVAL, chunkID, callback );
            } else {
                console.log( "Next ID: " + data.next_change_id );
                callback( data );
            }
        // } catch ( e ) {
        //     console.log( "Error occured, retrying: " + e );
        //     setTimeout( Chunk.download, config.CHUNK_RETRY_INTERVAL, chunkID, callback );
        // }
    }

    static writeChunkStats( chunkStats ) {
        fs.appendFile( __dirname + "/stats_chunk.csv", chunkStats, function( err ) {
            if ( err ) {
                return console.log( err );
            }
        });
    }
}

module.exports = Chunk;