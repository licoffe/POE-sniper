/**
 * Misc class
 *
 * Random useful methods
 * @params Nothing
 * @return Misc object
 */

var request = require( "request" );
var config  = require( "./config.json" );

class Misc {

    /**
     * Generates a random id
     * From http://stackoverflow.com/questions/105034/create-guid-uuid-in-javascript
     *
     * @param Nothing
     * @return Random id
     */
    static guidGenerator() {
        var S4 = function() {
            return (((1+Math.random())*0x10000)|0).toString(16).substring(1);
        };
        return (S4()+S4()+"-"+S4()+"-"+S4()+"-"+S4()+"-"+S4()+S4()+S4());
    }

    /**
     * Format message to send to the players
     *
     * Replace placeholders using item information to format a whisper msg
     * @params item data, callback
     * @return return formatted message through callback
     */
    static formatMessage( data, cb ) {
        var str = config.message;
        if ( data.originalPrice === "Negociate price" ) {
            str = config.barter;
        }
        if ( data.name !== data.typeLine ) {
            data.name += " " + data.typeLine;
        }
        str     = str.replace( /<account>/g, data.accountName );
        str     = str.replace( "<item>",     data.whisperName );
        str     = str.replace( "<league>",   data.league );
        str     = str.replace( "<stash>",    data.stashName );
        str     = str.replace( "<price>",    data.originalPrice );
        str     = str.replace( "<stashTab>", data.stashTab );
        str     = str.replace( "<left>",     data.left );
        str     = str.replace( "<top>",      data.top );
        cb( str );
    }

    /**
     * Send messages to the status bar
     *
     * @params Message to display
     * @return Nothing
     */
    static publishStatusMessage( message ) {
        $( "#status-message" ).removeClass( "fadedText" );
        $( "#status-message" ).html( "<b>Status:</b> " + message );
        $( "#status-message" ).addClass( "fadedText" );
    }

    /**
     * Check if a new release is available using the GitHub API
     *
     * @params callback
     * @return False or last release data through callback
     */
    static checkUpdate( callback ) {
        var packageInfo    = require( "./package.json" );
        var currentVersion = packageInfo.version;
        // Fetch last release information using GitHub API
        request({ 
                "url": "https://api.github.com/repos/licoffe/POE-sniper/releases/latest", 
                "gzip": true, 
                "headers": { "User-Agent": "Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/41.0.2228.0 Safari/537.36" }
            },
            function( error, response, body ) {
                // If there is an error, retry dowloading after delay
                if ( error ) {
                    console.log( "Error occured, retrying: " + error );
                }
                try {
                    var data = JSON.parse( body, 'utf8' );
                    if ( data.tag_name && currentVersion < data.tag_name ) {
                        console.log( "New update available" );
                        callback({
                            version:   data.tag_name,
                            date:      data.published_at,
                            changelog: data.body,
                            author:    data.author.login
                        });
                    } else {
                        // console.log( "You have the last update" );
                        callback( false );
                    }
                } catch ( err ) {
                    console.log( err );
                    callback( false );
                }
            }
        );
    }
}

module.exports = Misc;