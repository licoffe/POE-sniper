/**
 * Misc class
 *
 * Random useful methods
 * @params Nothing
 * @return Misc object
 */

var config = require( "./config.json" );

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
        str     = str.replace( /<account>/g, data.accountName );
        str     = str.replace( "<item>",     data.name );
        str     = str.replace( "<league>",   data.league );
        str     = str.replace( "<stash>",    data.stashName );
        str     = str.replace( "<price>",    data.originalPrice );
        cb( str );
    }
}

module.exports = Misc;