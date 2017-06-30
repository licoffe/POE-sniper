/**
 * Currency class
 *
 * Translate long currency names to trade symbol and look up last rates
 * @params Leagues
 * @return Currency object
 */

var async   = require( "async" );
var config  = require( "./config.json" );
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
        async.each( leagues, function( league, cbLeague ) {
            $.get( "http://poe-rates.com/actions/getLastRates.php", {
                league: league
            }, function( data ) {
                shortRates[league] = {};
                var parsed = $.parseJSON( data );
                var rates  = parsed.rates;
                // Change long rate name to short one using lookup table
                for ( var rate in rates ) {
                    if ( rates.hasOwnProperty( rate )) {
                        shortRates[league][Currency.currencyLookupTable[rate]] = parseFloat( rates[rate]);
                    }
                }
                shortRates[league].chaos = 1.0;
                cbLeague();
            });
        }, function( err ) {
            if ( err ) {
                console.log( err );
            }
            callback( shortRates );
        });
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

module.exports = Currency;