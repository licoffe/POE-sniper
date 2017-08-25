/**
 * Misc class
 *
 * Random useful methods
 * @params Nothing
 * @return Misc object
 */

var request = require( "request" );
var fs      = require( "fs" );
const {app} = require( "electron" ).remote;
const path  = require( "path" );
var config           = {};
console.log( "Loading config from " + app.getPath( "userData" ) + path.sep + "config.json" );
config = require( app.getPath( "userData" ) + path.sep + "config.json" );


class Misc {

    /**
     * Fetch active leagues from poe-rates.com API
     *
     * @params callback
     * @return return leagues through callback
     */
    static getLeagues( callback ) {
        $.get( "http://poe-rates.com/actions/getLeagues.php",
            function( data ) {
                callback( $.parseJSON( data ).leagues );
            }
        )
    }

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
        if ( data.originalPrice === "Negotiate price" ) {
            str = config.barter;
        }
        if ( data.name !== data.typeLine ) {
            data.name += " " + data.typeLine;
        }
        if ( config.useBeta ) {
            data.league = "Beta " + data.league;
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
     * Extract from data from a poe.trade search
     *
     * @params poe.trade search URL, callback
     * @return Extracted data through callback
     */
    static extractPoeTradeSearchParameters( poeTradeSearchURL, callback ) {
        // Fetch URL, and store it in the page
        $.get( poeTradeSearchURL, {}, function( data ) {
            var wrapper = document.getElementById( "poe-trade-search-output" );
            wrapper.innerHTML = data;
            $( "#poe-trade-search-output script" ).remove();
            $( "#poe-trade-search-output link" ).remove();
            data = {
                league:          $( "#poe-trade-search-output select[name='league'] option:selected" ).first().text(),
                type:            $( "#poe-trade-search-output select[name='type'] option:selected" ).text().trim(),
                base:            $( "#poe-trade-search-output select[name='base'] option:selected" ).text(),
                name:            $( "#poe-trade-search-output input#name" ).val(),
                dmg_min:         $( "#poe-trade-search-output #prop-dmg input[name='dmg_min']" ).val(),
                dmg_max:         $( "#poe-trade-search-output #prop-dmg input[name='dmg_max']" ).val(),
                aps_min:         $( "#poe-trade-search-output #prop-aps input[name='aps_min']" ).val(),
                aps_max:         $( "#poe-trade-search-output #prop-aps input[name='aps_max']" ).val(),
                crit_min:        $( "#poe-trade-search-output #prop-crit input[name='crit_min']" ).val(),
                crit_max:        $( "#poe-trade-search-output #prop-crit input[name='crit_max']" ).val(),
                dps_min:         $( "#poe-trade-search-output #prop-dps input[name='dps_min']" ).val(),
                dps_max:         $( "#poe-trade-search-output #prop-dps input[name='dps_max']" ).val(),
                edps_min:        $( "#poe-trade-search-output #prop-edps input[name='edps_min']" ).val(),
                edps_max:        $( "#poe-trade-search-output #prop-edps input[name='edps_max']" ).val(),
                pdps_min:        $( "#poe-trade-search-output #prop-pdps input[name='pdps_min']" ).val(),
                pdps_max:        $( "#poe-trade-search-output #prop-pdps input[name='pdps_max']" ).val(),
                armour_min:      $( "#poe-trade-search-output input[name='armour_min']" ).val(),
                armour_max:      $( "#poe-trade-search-output input[name='armour_max']" ).val(),
                evasion_min:     $( "#poe-trade-search-output input[name='evasion_min']" ).val(),
                evasion_max:     $( "#poe-trade-search-output input[name='evasion_max']" ).val(),
                shield_min:      $( "#poe-trade-search-output input[name='shield_min']" ).val(),
                shield_max:      $( "#poe-trade-search-output input[name='shield_max']" ).val(),
                block_min:       $( "#poe-trade-search-output input[name='block_min']" ).val(),
                block_max:       $( "#poe-trade-search-output input[name='block_max']" ).val(),
                sockets_min:     $( "#poe-trade-search-output input[name='sockets_min']" ).val(),
                sockets_max:     $( "#poe-trade-search-output input[name='sockets_max']" ).val(),
                link_min:        $( "#poe-trade-search-output input[name='link_min']" ).val(),
                link_max:        $( "#poe-trade-search-output input[name='link_max']" ).val(),
                sockets_r:       $( "#poe-trade-search-output input[name='sockets_r']" ).val(),
                sockets_g:       $( "#poe-trade-search-output input[name='sockets_g']" ).val(),
                sockets_b:       $( "#poe-trade-search-output input[name='sockets_b']" ).val(),
                sockets_w:       $( "#poe-trade-search-output input[name='sockets_w']" ).val(),
                linked_r:        $( "#poe-trade-search-output input[name='linked_r']" ).val(),
                linked_g:        $( "#poe-trade-search-output input[name='linked_g']" ).val(),
                linked_b:        $( "#poe-trade-search-output input[name='linked_b']" ).val(),
                linked_w:        $( "#poe-trade-search-output input[name='linked_w']" ).val(),
                rlevel_min:      $( "#poe-trade-search-output input[name='rlevel_min']" ).val(),
                rlevel_max:      $( "#poe-trade-search-output input[name='rlevel_max']" ).val(),
                rstr_min:        $( "#poe-trade-search-output input[name='rstr_min']" ).val(),
                rstr_max:        $( "#poe-trade-search-output input[name='rstr_max']" ).val(),
                rdex_min:        $( "#poe-trade-search-output input[name='rdex_min']" ).val(),
                rdex_max:        $( "#poe-trade-search-output input[name='rdex_max']" ).val(),
                rint_min:        $( "#poe-trade-search-output input[name='rint_min']" ).val(),
                rint_max:        $( "#poe-trade-search-output input[name='rint_max']" ).val(),
                q_min:           $( "#poe-trade-search-output input[name='q_min']" ).val(),
                q_max:           $( "#poe-trade-search-output input[name='q_max']" ).val(),
                level_min:       $( "#poe-trade-search-output input[name='level_min']" ).val(),
                level_max:       $( "#poe-trade-search-output input[name='level_max']" ).val(),
                ilvl_min:        $( "#poe-trade-search-output input[name='ilvl_min']" ).val(),
                ilvl_max:        $( "#poe-trade-search-output input[name='ilvl_max']" ).val(),
                rarity:          $( "#poe-trade-search-output select[name='rarity'] option:selected" ).text(),
                seller:          $( "#poe-trade-search-output input[name='seller']" ).val(),
                thread:          $( "#poe-trade-search-output input[name='thread']" ).val(),
                identified:      $( "#poe-trade-search-output select[name='identified'] option:selected" ).text(),
                corrupted:       $( "#poe-trade-search-output select[name='corrupted'] option:selected" ).text(),
                online:          $( "#poe-trade-search-output input[name='online']:checked" ).val(),
                buyout:          $( "#poe-trade-search-output select[name='has_buyout'] option:selected" ).text(),
                alt_art:         $( "#poe-trade-search-output input[name='altart']:checked" ).val(),
                capquality:      $( "#poe-trade-search-output input[name='capquality']:checked" ).val(),
                buyout_min:      $( "#poe-trade-search-output input[name='buyout_min']" ).val(),
                buyout_max:      $( "#poe-trade-search-output input[name='buyout_max']" ).val(),
                buyout_currency: $( "#poe-trade-search-output select[name='buyout_currency'] option:selected" ).text(),
                crafted:         $( "#poe-trade-search-output select[name='crafted'] option:selected" ).text(),
                enchanted:       $( "#poe-trade-search-output select[name='enchanted'] option:selected" ).text(),
                mods:            {}
            };
            // Extract mods
            $( "#poe-trade-search-output select[name='mod_name']" ).each( function() {
                var mod_name = $( this ).find( "option:selected" ).val();
                if ( mod_name ) {
                    var mod_min  = $( this ).parent().parent().find( "input[name='mod_min']" ).val();
                    var mod_max  = $( this ).parent().parent().find( "input[name='mod_max']" ).val();
                    var pseudo   = mod_name.indexOf( "total" ) !== -1;
                    mod_name = mod_name.replace( "(pseudo) (total)", "[TOTAL]" )
                                       .replace( "(pseudo)", "[PSEUDO]" )
                                       .replace( "(enchant)", "" ).trim();
                    data.mods[mod_name] = { min: mod_min, max: mod_max, pseudo: pseudo };
                }
            });
            callback( data );
        });
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
                // If there is an error, retry downloading after delay
                if ( error ) {
                    console.log( "Error occurred, retrying: " + error );
                }
                try {
                    var data = JSON.parse( body, 'utf8' );
                    if ( data.tag_name && currentVersion !== data.tag_name ) {
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