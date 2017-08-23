/**
 * Currency class
 *
 * Translate long currency names to trade symbol and look up last rates
 * @params Leagues
 * @return Currency object
 */

var async   = require( "async" );
const {app} = require( "electron" ).remote;
const path  = require( "path" );
var config  = require( app.getPath( "userData" ) + path.sep + "config.json" );
var Misc    = require( "./misc.js" );
var leagues = config.leagues;

class Currency {

    /**
     * Fetch last currency rates from poe-rates.com API
     *
     * Fetch currency rates in chaos for each leagues from
     * the poe-rates API.
     * @params callback
     * @return return rates through callback
     */
    static getLastRates( callback ) {
        // console.log( "Downloading last rates from poe-rates.com" );
        Misc.publishStatusMessage( "Downloading last rates from poe-rates.com" );
        var shortRates = {};
        // For each league
        try {
            async.each( config.leagues, function( league, cbLeague ) {
                $.get( "http://poe-rates.com/actions/getLastRates.php", {
                    league: league
                }, function( data ) {
                    shortRates[league] = {};
                    var parsed = $.parseJSON( data );
                    var rates  = parsed.rates;
                    // Change long rate name to short one using lookup table
                    for ( var rate in rates ) {
                        if ( rates.hasOwnProperty( rate )) {
                            shortRates[league][Currency.shortToLongLookupTable[rate]] = parseFloat( rates[rate]);
                        }
                    }
                    shortRates[league]["Chaos Orb"] = 1.0;
                    cbLeague();
                });
            }, function( err ) {
                if ( err ) {
                    console.log( err );
                    setTimeout( Currency.getLastRates, 1000, callback );
                }
                callback( shortRates );
            });
        } catch ( e ) {
            console.log( "Error occured, retrying: " + e );
            setTimeout( Currency.getLastRates, 1000, callback );
        }
    }
}

Currency.currencyLookupTable = {
    "Exalted Orb":           "exa",
    "Chaos Orb":             "chaos",
    "Orb of Alchemy":        "alch", 
    "Orb of Alteration":     "alt", 
    "Orb of Fusing":         "fuse", 
    "Divine Orb":            "divine",
    "Orb of Chance":         "chance", 
    "Jeweller's Orb":        "jew", 
    "Cartographer's Chisel": "chisel", 
    "Vaal Orb":              "vaal", 
    "Orb of Regret":         "regret", 
    "Regal Orb":             "regal",
    "Gemcutter's Prism":     "gcp",
    "Chromatic Orb":         "chrome",
    "Orb of Scouring":       "scour",
    "Blessed Orb":           "bless"
};

Currency.shortToLongLookupTable = {
    "exa":    "Exalted Orb",
    "chaos":  "Chaos Orb",
    "alch":   "Orb of Alchemy",
    "alt":    "Orb of Alteration",
    "fuse":   "Orb of Fusing",
    "divine": "Divine Orb",
    "chance": "Orb of Chance",
    "jew":    "Jeweller's Orb",
    "chisel": "Cartographer's Chisel",
    "vaal":   "Vaal Orb",
    "regret": "Orb of Regret",
    "regal":  "Regal Orb",
    "gcp":    "Gemcutter's Prism",
    "chrom":  "Chromatic Orb",
    "scour":  "Orb of Scouring",
    "bless":  "Blessed Orb"
};

module.exports = Currency;