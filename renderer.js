// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// All of the Node.js APIs are available in this process.

// Requirements
var fs               = require( "fs" );
var async            = require( "async" );
var request          = require( "request" );
var config           = require( "./config.json" );
var itemTypes        = require( "./itemTypes.json" );
var dns              = require( "dns" ),
dnscache = require( "dnscache" )({
    "enable" : true,
    "ttl" : 300,
    "cachesize" : 1000
});

var mu = require( 'mu2' );
mu.root = __dirname + '/templates';
const notifier = require('node-notifier');
var ncp        = require( "copy-paste" );
var editingFilter = "";
var downloading = false;
var filters     = [];
var results     = [];
var resultsId   = [];
var entryLookup = {};
var priceReg    = /(?:([0-9\.]+)|([0-9]+)\/([0-9]+)) ([a-z]+)/g;
var currencyRates = {};
var currencyLookupTable = {
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
var leagues = [
    "Standard", "Hardcore", "Legacy", "Hardcore Legacy"
];

var writeChunkStats = function( chunkStats ) {
    fs.appendFile( __dirname + "/stats_chunk.csv", chunkStats, function( err ) {
        if ( err ) {
            return console.log( err );
        }
        console.log( "The file was saved!" );
    });
};

var writeFilterStats = function( filterStats ) {
    fs.appendFile( __dirname + "/stats_filters.csv", filterStats, function( err ) {
        if ( err ) {
            return console.log( err );
        }
        console.log( "The file was saved!" );
    });
};

var getLastRates = function( callback ) {
    var shortRates = {};
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
                    shortRates[league][currencyLookupTable[rate]] = parseFloat( rates[rate]);
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
};

setInterval( getLastRates, 10000, function( rates ) {
    currencyRates = rates;
});

var getLastItemPrices = function( filters, callback ) {
    var prices = {};
    async.each( filters, function( filter, cbFilter ) {
        $.get( "http://poe-rates.com/actions/getItemPrices.php", {
            league: filter.league,
            item:   filter.item,
            links:  filter.links - 1
        }, function( data ) {
            var parsed = $.parseJSON( data );
            prices[filter.id] = parsed;
            cbFilter();
        });
    }, function( err ) {
        if ( err ) {
            console.log( err );
        }
        callback( prices );
    });
};

$( document).ready( function() {
    
    // Generate selects
    $( 'select' ).material_select();

    // When clicking on `Cancel editing`
    $( "#cancel-filter" ).click( function() {
        $( "#league" ).val( "Legacy" );
        $( "#league").material_select();
        $( "#item" ).val( "" );
        $( "#price" ).val( "" );
        $( "#currency" ).val( "chaos" );
        $( "#currency").material_select();
        $( "#links" ).val( "any" );
        $( "#links").material_select();
        $( "#sockets" ).val( "" );
        $( "#corrupted" ).val( "any" );
        $( "#corrupted").material_select();
        $( "#crafted" ).val( "any" );
        $( "#crafted").material_select();
        $( "#enchanted" ).val( "any" );
        $( "#enchanted").material_select();
        $( "#identified" ).val( "any" );
        $( "#identified").material_select();
        $( "#level" ).val( "" );
        $( "#tier" ).val( "" );
        $( "#quality" ).val( "" );
        $( "#rarity" ).val( "any" );
        $( "#rarity").material_select();
        $( "#armor" ).val( "" );
        $( "#es" ).val( "" );
        $( "#evasion" ).val( "" );
        $( "#dps" ).val( "" );
        $( "#price-bo" ).prop( "checked", true );
        $( "#clipboard" ).prop( "checked", false );
        $( "#affixes-list" ).empty();
        $( "#item-type" ).val( "any" );
        $( "#item-type").material_select();

        if ( $( this ).text() !== "Clear filter" ) {
            $( "#add-filter" ).text( "Add filter" );
            $( "#cancel-filter" ).text( "Clear filter" );
            $( "#cancel-filter" ).removeClass( "red" ).addClass( "blue-grey" );
        }
    });

    // When clicking on 'Add filter', add filter
    $( "#add-filter" ).click( function() {
        var league     = $( "#league" ).val();
        var item       = $( "#item" ).val();
        var budget     = $( "#price" ).val();
        var currency   = $( "#currency" ).val();
        var links      = $( "#links" ).val();
        var sockets    = $( "#sockets" ).val();
        var corrupted  = $( "#corrupted" ).val();
        var crafted    = $( "#crafted" ).val();
        var enchanted  = $( "#enchanted" ).val();
        var identified = $( "#identified" ).val();
        var level      = $( "#level" ).val();
        var tier       = $( "#tier" ).val();
        var quality    = $( "#quality" ).val();
        var rarity     = $( "#rarity" ).val();
        var armor      = $( "#armor" ).val();
        var es         = $( "#es" ).val();
        var evasion    = $( "#evasion" ).val();
        var dps        = $( "#dps" ).val();
        var buyout     = $( "#price-bo" ).is(":checked");
        var clipboard  = $( "#clipboard" ).is(":checked");
        var itemType   = $( "#item-type" ).val();
        var affixesDis = [];
        var affixes    = {};
        // var re         = /([0-9.]+)/g;
        $( ".affix-item" ).each( function() {
            data = $( this ).data( "data-item" );
            affixes[data.title] = [data.min, data.max];
            var count = ( data.title.match( /#/g ) || []).length;
            console.log( data.title );
            console.log( count );
            var affix = "";
            if ( count > 1 ) {
                affix = data.title.replace( "#", data.min );
                affix = affix.replace( "#", data.max );
            } else {
                affix = data.title.replace( "#", "( " + data.min + " - " + data.max + " )" );
            }
            affixesDis.push( affix );
        });
        console.log( affixes );
        // console.log( league );
        // console.log( currencyRates );
        if ( budget > currencyRates[league].exa && currency === "chaos" ) {
            budget /= currencyRates[league].exa;
            currency = "exa";
        }
        budget = Math.round( budget * 100 ) / 100;
        var title = "";
        if ( corrupted === "true" ) {
            title += "<span class=\"filter-corrupted\">Corrupted</span>";
        }
        if ( enchanted === "true" ) {
            title += "<span class=\"filter-enchanted\">Enchanted</span>";
        }
        if ( crafted === "true" ) {
            title += "<span class=\"filter-crafted\">Crafted</span>";
        }
        if ( itemType !== "any" ) {
            title += "<span style=\"padding-right: 10px;\">" + item + "(any " + itemType + ")</span>";
        } else {
            title += "<span style=\"padding-right: 10px;\">" + item + "</span>";
        }
        
        if ( links !== "0" && links !== "any" ) {
            title += "<span class=\"filter-links\">" + links + "L</span>";
        }
        if ( sockets !== "" && sockets !== 0 ) {
            title += "<span class=\"filter-sockets\">" + sockets + "S</span>";
        }

        if ( armor !== "" ) {
            title += "<span class=\"filter-property\">Armor>=" + armor + "</span>";
        }
        if ( es !== "" ) {
            title += "<span class=\"filter-property\">ES>=" + es + "</span>";
        }
        if ( evasion !== "" ) {
            title += "<span class=\"filter-property\">Evasion>=" + evasion + "</span>";
        }
        if ( dps !== "" ) {
            title += "<span class=\"filter-property\">DPS>=" + dps + "</span>";
        }
        if ( quality !== "" ) {
            title += "<span class=\"filter-property\">quality>=" + quality + "%</span>";
        }
        if ( level !== "" ) {
            title += "<span class=\"filter-property\">level>=" + level + "</span>";
        }
        if ( tier !== "" ) {
            title += "<span class=\"filter-property\">Tier>=" + tier + "</span>";
        }
        if ( affixesDis.length > 0 ) {
            title += "<span class=\"filter-affix\">" + affixesDis.join( ", " ) + "</span>";
        }

        var filterId = editingFilter !== "" ? editingFilter : guidGenerator();

        // console.log( item );
        var filter   = {
            league:     league,
            item:       item,
            title:      title,
            budget:     budget,
            currency:   currency,
            links:      links,
            sockets:    sockets,
            id:         filterId,
            corrupted:  corrupted,
            crafted:    crafted,
            enchanted:  enchanted,
            identified: identified,
            level:      level,
            tier:       tier,
            quality:    quality,
            rarity:     rarity,
            armor:      armor,   
            es:         es,      
            evasion:    evasion, 
            dps:        dps,
            affixes:    affixes,
            affixesDis: affixesDis,
            buyout:     buyout,
            clipboard:  clipboard,
            itemType:   itemType     
        };
        // console.log( filter );
        if ( $( "#add-filter" ).text() === "Add filter" ) {
            filters.push( filter );
            render( filter );
        } else {
            var newFilters = [];
            async.each( filters, function( oldFilter, cbFilter ) {
                if ( oldFilter.id === filterId ) {
                    console.log( "Found filter" );
                    newFilters.push( filter );
                } else {
                    newFilters.push( oldFilter );
                }
                cbFilter();
            }, function( err ) {
                if ( err ) {
                    console.log( err );
                }
                filters = newFilters;
                // console.log( filters );
                render( filter );
            });
        }
    });

    var render = function( filter ) {
        var generated = "";
        mu.compileAndRender( "filter.html", filter )
        .on( "data", function ( data ) {
            generated += data.toString();
        })
        .on( "end", function () {
            if ( $( "#add-filter" ).text() === "Add filter" ) {
                $( "#filters ul" ).append( generated );
            } else {
                $( "#filters ul li" ).has( "#" + editingFilter ).remove();
                $( "#filters ul" ).append( generated );
                editingFilter = "";
                $( "#add-filter" ).text( "Add filter" );
                $( "#cancel-filter" ).text( "Clear filter" );
                $( "#cancel-filter" ).removeClass( "red" ).addClass( "blue-grey" );
            }
            // Color item name depending on rarity
            if ( filter.rarity === "1" ) {
                $( "#" + filter.id ).parent().parent().find( ".item" ).addClass( "magic" );
            } else if ( filter.rarity === "2" ) {
                $( "#" + filter.id ).parent().parent().find( ".item" ).addClass( "rare" );
            } else if ( filter.rarity === "3" ) {
                $( "#" + filter.id ).parent().parent().find( ".item" ).addClass( "unique" );
            } else if ( filter.rarity === "4" ) {
                $( "#" + filter.id ).parent().parent().find( ".item" ).addClass( "gem" );
            } else if ( filter.rarity === "5" ) {
                $( "#" + filter.id ).parent().parent().find( ".item" ).addClass( "currency" );
            } else if ( filter.rarity === "6" ) {
                $( "#" + filter.id ).parent().parent().find( ".item" ).addClass( "divination" );
            } else if ( filter.rarity === "8" ) {
                $( "#" + filter.id ).parent().parent().find( ".item" ).addClass( "prophecy" );
            } else if ( filter.rarity === "9" ) {
                $( "#" + filter.id ).parent().parent().find( ".item" ).addClass( "legacy" );
            }
            if ( filter.buyout ) {
                $( "#" + filter.id ).parent().parent().find( ".buyout" ).hide();
            }
            if ( !filter.clipboard ) {
                $( "#" + filter.id ).parent().parent().find( ".clipboard" ).hide();
            }
            bindFilterEdit( filter.id );
            updateFilterAmount( filter.id );
            getLastItemPrices( filters, function( prices ) {
                showItemStats( filters, prices );
            });
        });
        saveFilters( filters );
    };

    var bindFilterEdit = function( id ) {
        $( "#filters ul li" ).has( "#" + id ).click( function() {
            editingFilter = id;
            // Search for filter with the corresponding id
            async.each( filters, function( filter, cbFilter ) {
                // if filter matches, load all filter informations in the fields
                if ( filter.id === id ) {
                    $( "#league" ).val( filter.league );
                    $( "#league").material_select();
                    $( "#item" ).val( filter.item );
                    $( "#price" ).val( filter.budget );
                    $( "#currency" ).val( filter.currency );
                    $( "#currency").material_select();
                    $( "#links" ).val( filter.links );
                    $( "#links").material_select();
                    $( "#sockets" ).val( filter.sockets );
                    $( "#corrupted" ).val( filter.corrupted );
                    $( "#corrupted").material_select();
                    $( "#crafted" ).val( filter.crafted );
                    $( "#crafted").material_select();
                    $( "#enchanted" ).val( filter.enchanted );
                    $( "#enchanted").material_select();
                    $( "#identified" ).val( filter.identified );
                    $( "#identified").material_select();
                    $( "#level" ).val( filter.level );
                    $( "#tier" ).val( filter.tier );
                    $( "#quality" ).val( filter.quality );
                    $( "#rarity" ).val( filter.rarity );
                    $( "#rarity").material_select();
                    $( "#armor" ).val( filter.armor );
                    $( "#es" ).val( filter.es );
                    $( "#evasion" ).val( filter.evasion );
                    $( "#dps" ).val( filter.dps );
                    $( "#price-bo" ).prop( "checked", filter.buyout );
                    $( "#clipboard" ).prop( "checked", filter.clipboard );
                    $( "#add-filter" ).text( "Update filter" );
                    $( "#cancel-filter" ).text( "Cancel edit" );
                    $( "#cancel-filter" ).addClass( "red" ).removeClass( "blue-grey" );
                    $( "#item-type" ).val( filter.itemType );
                    $( "#item-type" ).material_select();
                    $( "#affixes-list" ).empty();
                    // For each affix
                    async.each( filter.affixesDis, function( affix, cbAffix ) {
                        var generated = "";
                        // Extract title, min and max
                        var reg = /([0-9\.]+)/g;
                        var match = reg.exec( affix );
                        var matches = [];
                        while ( match !== null ) {
                            matches.push( parseFloat( match[1]));
                            match = reg.exec( affix );
                        }
                        var title = affix.replace( reg, "#" );
                        var obj = {
                            title: title,
                            min:   matches[0],
                            max:   matches[1],
                            affix: affix,
                            id:    guidGenerator()
                        };
                        mu.compileAndRender( "affix.html", obj )
                        .on( "data", function ( data ) {
                            generated += data.toString();
                        })
                        .on( "end", function () {
                            $( "#affixes-list" ).append( generated );
                            $( "#" + obj.id ).data( "data-item", obj );
                            // When clicking on remove affix
                            $( ".remove-affix" ).click( function() {
                                $( this ).parent().parent().remove();
                            });
                        });
                        cbAffix();
                    });
                }
                cbFilter();
            }, function( err ) {
                if ( err ) {
                    console.log( err );
                }
            });
        });
    };

    // Write filter to disk
    var saveFilters = function( filters ) {
        fs.writeFile( __dirname + "/filters.json", JSON.stringify( filters ), function( err ) {
            if ( err ) {
                return console.log( err );
            }
            console.log( "The file was saved!" );
        });
    };

    var showItemStats = function( filters, prices ) {
        async.each( filters, function( filter, cbFilter ) {
            if ( prices[filter.id]) {
                var str = "";
                $.post( "http://poe.trade/search", { name: filter.item, league: filter.league, online: "x", has_buyout: "1" }, function( data ) {
                    var wrapper = document.getElementById( "poe-trade-output" );
                    wrapper.innerHTML = data;
                    // $( "div.poe-trade-output" ).html( data );
                    $( "#poe-trade-output script" ).remove();
                    $( "#poe-trade-output link" ).remove();
                    var prices = [];
                    var priceCount = {};
                    var mostPopularCount = 0;
                    var mostPopularPrice = "";
                    var sellers = [];
                    $( "#poe-trade-output .item" ).each( function() {
                        var seller = $( this ).data( "seller" );
                        if ( sellers.indexOf( seller ) === -1 ) {
                            // console.log( $( this ).data( "buyout" ));
                            sellers.push( seller );
                            prices.push( $( this ).data( "buyout" ));
                            if ( !priceCount[$( this ).data( "buyout" )]) {
                                priceCount[$( this ).data( "buyout" )] = 0;
                            }
                            priceCount[$( this ).data( "buyout" )]++;
                            if ( priceCount[$( this ).data( "buyout" )] > mostPopularCount ) {
                                mostPopularPrice = $( this ).data( "buyout" );
                                mostPopularCount = priceCount[$( this ).data( "buyout" )];
                            }
                        }
                    });
                    str += "<span>Market stats based on <b>" + prices.length + "</b> items</span>";
                    for ( var p in priceCount ) {
                        if ( priceCount.hasOwnProperty( p ) && priceCount[p] > 1 ) {
                            str += "<span>" + p + ": <b>" + priceCount[p] + "</b></span>";
                        }
                    }
                    $( "#" + filter.id ).parent().parent().find( ".item-stats" ).html(
                        str
                    );
                    // console.log( "Stats over " + prices.length + " items" );
                    // console.log( "Most popular price: " + mostPopularPrice + " with " + mostPopularCount );
                    // console.log( "Median price: " + prices[parseInt( prices.length/2)]);
                    cbFilter();
                });
                // getLastRates( function( rates ) {
                //     currencyRates = rates;
                //     console.log( "Fetched last rates" );
                //     if ( prices[filter.id][filter.item]) {
                //         if ( prices[filter.id].min > currencyRates[filter.league].exa) {
                //             str += "<span>Market stats based on <b>" + prices[filter.id][filter.item].amount + "</b> items</span><span>min: <b>" + Math.round( prices[filter.id][filter.item].min/currencyRates[filter.league].exa * 100 ) / 100 + "</b> exa";
                //         } else {
                //             str += "<span>Market stats based on <b>" + prices[filter.id][filter.item].amount + "</b> items</span><span>min: <b>" + Math.round( prices[filter.id][filter.item].min * 100 ) / 100 + "</b> chaos";
                //         }
                //         if ( prices[filter.id][filter.item].max > currencyRates[filter.league].exa) {
                //             str += "</span><span>max: <b>" + Math.round( prices[filter.id][filter.item].max/currencyRates[filter.league].exa * 100 ) / 100 + "</b> exa";
                //         } else {
                //             str += "</span><span>max: <b>" + Math.round( prices[filter.id][filter.item].max * 100 ) / 100 + "</b> chaos";
                //         }
                //         if ( prices[filter.id][filter.item].mean > currencyRates[filter.league].exa) {
                //             str += "</span><span>mean: <b>" + Math.round( prices[filter.id][filter.item].mean/currencyRates[filter.league].exa * 100 ) / 100 + "</b> exa";
                //         } else {
                //             str += "</span><span>mean: <b>" + Math.round( prices[filter.id][filter.item].mean * 100 ) / 100 + "</b> chaos";
                //         }
                //         if ( prices[filter.id].median > currencyRates[filter.league].exa) {
                //             str += "</span><span>median: <b>" + Math.round( prices[filter.id][filter.item].median/currencyRates[filter.league].exa * 100 ) / 100 + "</b> exa";
                //         } else {
                //             str += "</span><span>median: <b>" + Math.round( prices[filter.id][filter.item].median * 100 ) / 100 + "</b> chaos";
                //         }
                //         if ( prices[filter.id][filter.item].mode > currencyRates[filter.league].exa) {
                //             str += "</span><span>mode: <b>" + Math.round( prices[filter.id][filter.item].mode/currencyRates[filter.league].exa * 100 ) / 100 + "</b> exa</span>";
                //         } else {
                //             str += "</span><span>mode: <b>" + Math.round( prices[filter.id][filter.item].mode * 100 ) / 100 + "</b> chaos</span>";
                //         }
                //         $( "#" + filter.id ).parent().parent().find( ".item-stats" ).html(
                //             str
                //         );
                //     }
                //     cbFilter();
                // });
            }
        });
    };

    // Load filters
    var loadFilters = function() {
        // Load filters file in memory
        filters = require( __dirname + "/filters.json" );
        // For each filter, generate using the 'filter' template
        async.each( filters, function( filter, cbFilter ) {
            var generated = "";
            mu.compileAndRender( "filter.html", filter )
            .on( "data", function ( data ) {
                generated += data.toString();
            })
            .on( "end", function () {
                $( "#filters ul" ).append( generated );
                // Color item name depending on rarity
                if ( filter.rarity === "1" ) {
                    $( "#" + filter.id ).parent().parent().find( ".item" ).addClass( "magic" );
                } else if ( filter.rarity === "2" ) {
                    $( "#" + filter.id ).parent().parent().find( ".item" ).addClass( "rare" );
                } else if ( filter.rarity === "3" ) {
                    $( "#" + filter.id ).parent().parent().find( ".item" ).addClass( "unique" );
                } else if ( filter.rarity === "4" ) {
                    $( "#" + filter.id ).parent().parent().find( ".item" ).addClass( "gem" );
                } else if ( filter.rarity === "5" ) {
                    $( "#" + filter.id ).parent().parent().find( ".item" ).addClass( "currency" );
                } else if ( filter.rarity === "6" ) {
                    $( "#" + filter.id ).parent().parent().find( ".item" ).addClass( "divination" );
                } else if ( filter.rarity === "8" ) {
                    $( "#" + filter.id ).parent().parent().find( ".item" ).addClass( "prophecy" );
                } else if ( filter.rarity === "9" ) {
                    $( "#" + filter.id ).parent().parent().find( ".item" ).addClass( "legacy" );
                }
                if ( filter.buyout ) {
                    $( "#" + filter.id ).parent().parent().find( ".buyout" ).hide();
                }
                if ( !filter.clipboard ) {
                    $( "#" + filter.id ).parent().parent().find( ".clipboard" ).hide();
                }
                bindFilterEdit( filter.id );
                updateFilterAmount( filter.id );
                cbFilter();
            });
        }, function( err ) {
            if ( err ) {
                console.log( err );
            }
            getLastItemPrices( filters, function( prices ) {
                showItemStats( filters, prices );
            });
        });
    };
    loadFilters();
    setInterval( getLastItemPrices, 60000, filters, function( prices ) {
        showItemStats( filters, prices );
    });

    // When clicking on 'Snipe', download change_ids and filter them
    $( "#snipe" ).click( function() {
        if ( !downloading ) {
            downloading = true;
            interrupt   = false;
            $( ".progress" ).fadeIn();
            $( "#snipe" ).text( "Stop" );
            lastDownloadedChunk( function( entry ) {
                downloadChunk( entry, downloadChunk );
            });
        } else {
            downloading = false;
            interrupt   = true;
            $( ".progress" ).fadeOut();
            $( "#snipe" ).text( "Snipe" );
        }
    });

    var updateFilterAmount = function( id ) {
        $( "#filters-amount" ).text( filters.length );
        bindRemoveFilter( id );
    };

    var updateResultsAmount = function() {
        $( "#results-amount" ).text( results.length );
    };

    // When clicking on share entries icon
    $( "#share-entries" ).click( function() {
        fs.writeFile( __dirname + "/export.json", JSON.stringify( results ), function( err ) {
            if ( err ) {
                console.log( err );
            }
        });
    });

    // When clicking on clear entries icon
    $( "#clear-entries" ).click( function() {
        $( "#results ul" ).empty();
        results   = [];
        resultsId = [];
        updateResultsAmount();
    });

    // When clicking on the minus sign, remove filter
    var bindRemoveFilter = function( id ) {
        $( "#" + id + ".remove-filter" ).click( function() {
            // Remove this entry
            $( this ).parent().parent().remove();
            var newFilters = [];
            var id         = $( this ).attr( "id" );
            // console.log( id );
            // Search for filter index and remove it from the array
            async.each( filters, function( filter, cb ) {
                if ( filter.id !== id ) {
                    newFilters.push( filter );
                }
                cb();
            }, function( err ) {
                if ( err ) {
                    console.log( err );
                }
                filters = newFilters;
                updateFilterAmount();
                saveFilters( filters );
            });
        });
    };

    // Format message to send to the players
    var formatMessage = function( data, cb ) {
        var str = config.message;
        str = str.replace( /<account>/g, data.accountName );
        str = str.replace( "<item>", data.name );
        str = str.replace( "<league>", data.league );
        str = str.replace( "<stash>", data.stashName );
        str = str.replace( "<price>", data.price );
        cb( str );
    };

    // When clicking on an entry result, copy a whisper message to clipboard
    var bindClickEntry = function( id ) {
        $( "#" + id ).click( function() {
            var data = $( this ).data( "item" );
            // var str = "@" + data.accountName + " Hi " + data.accountName + ", I would like to buy your '" + data.name + "' in " + data.league + " for " + data.price + " in stash '" + data.stashName + "'. Is it still available? :)";
            formatMessage( data, function( str ) {
                ncp.copy( str, function() {
                    notifier.notify({
                        'title': 'Message copied to clipboard',
                        'message': str,
                    });
                });
            });
        });
    };
    
    // When clicking on 'add affix'
    $( "#add-affix" ).click( function() {
        var affix = $( "#affixes" ).val();
        if ( affix !== "" ) {
            var min = $( "#affix-min" ).val();
            var max = $( "#affix-max" ).val();
            var count = ( affix.match( /#/g ) || []).length;
            if ( count > 1 ) {
                affix = affix.replace( "#", min );
                affix = affix.replace( "#", max );
            } else {
                affix = affix.replace( "#", "( " + min + " - " + max + " )" );
            }
            var obj = { 
                title: $( "#affixes" ).val(),
                affix: affix,
                min:   min,
                max:   max,
                id:    guidGenerator()
            };
            var generated = "";
            mu.compileAndRender( "affix.html", obj )
            .on( "data", function ( data ) {
                generated += data.toString();
            })
            .on( "end", function () {
                $( "#affixes-list" ).append( generated );
                $( "#" + obj.id ).data( "data-item", obj );
                // When clicking on remove affix
                $( ".remove-affix" ).click( function() {
                    $( this ).parent().parent().remove();
                });
            });
        }
    });

    var data = require( "./autocomplete.json" );
    var autocompleteContent = {};
    async.each( data, function( entry, cb ) {
        if ( entry.name === '' ) {
            autocompleteContent[entry.typeLine] = entry.icon;
        } else {
            autocompleteContent[entry.name] = entry.icon;
        }
        cb();
    }, function( err ) {
        if ( err ) {
            console.log( err );
        }
        $( '#item' ).autocomplete({
            data: autocompleteContent,
            limit: 20, // The max amount of results that can be shown at once. Default: Infinity.
        });
        // Close on Escape
        $( '#item' ).keydown( function( e ) {
            if ( e.which == 27 ) {
                $( ".autocomplete-content" ).empty();
            }
        });
        var affixCompletion = require( "./affix-completion.json" );
        // console.log( affixCompletion );
        $( '#affixes' ).autocomplete({
            data: affixCompletion,
            limit: 20, // The max amount of results that can be shown at once. Default: Infinity.
        });
        // Close on Escape
        $( '#affixes' ).keydown( function( e ) {
            if ( e.which == 27 ) {
                $( ".autocomplete-content" ).empty();
            }
        });
    });
    
    // Variables that can be tweaked
    var downloadInterval = 0; // Time between downloads in seconds

    var interrupt        = false;
    var debug            = false;

    /**
     * Return the next change ID to download from last downloaded chunk file
     *
     * @param Mysql database handler
     * @return Next change ID
     */
    var lastDownloadedChunk = function( callback ) {
        request({ "url": "http://api.poe.ninja/api/Data/GetStats", "gzip": true },
            function( error, response, body ) {
                if ( error ) {
                    console.log( "Error occured, retrying: " + error );
                    setTimeout( lastDownloadedChunk, 1000, callback );
                } else {
                    var data = JSON.parse( body, 'utf8' );
                    callback( data.nextChangeId );
                }
            }
        );
    };

    /**
     * Generates a random id
     * From http://stackoverflow.com/questions/105034/create-guid-uuid-in-javascript
     *
     * @param Nothing
     * @return Random id
     */
    function guidGenerator() {
        var S4 = function() {
        return (((1+Math.random())*0x10000)|0).toString(16).substring(1);
        };
        return (S4()+S4()+"-"+S4()+"-"+S4()+"-"+S4()+"-"+S4()+S4()+S4());
    }

    /**
     * Converts a second amount to a higer unit (min, hour, day...) if possible.
     *
     * @param Second amount to convert
     * @return JSON object with the converted value and corresponding unit
     */
    var secToNsec = function( secAmount ) {
        var units = [ "ms", "sec", "min", "hour", "day", "week", "month", "year" ];
        var counter = 0;
        if ( secAmount > 1000 ) {
            secAmount /= 1000; // sec
            counter++;
            if ( secAmount > 60 ) {
                secAmount /= 60; // minutes
                counter++;
                if ( secAmount > 60 ) {
                    secAmount /= 60; // hours
                    counter++;
                    if ( secAmount > 24 ) {
                        secAmount /= 24; // days
                        counter++;
                        if ( secAmount > 365 ) {
                            secAmount /= 365; // years
                            counter = 6;
                        } else if ( secAmount > 30 ) {
                            secAmount /= 30; // month
                            counter = 5;
                        } else if ( secAmount > 7 ) {
                            secAmount /= 7; // weeks
                            counter++;
                        }
                    }
                }
            }
        }
        return { "amount": secAmount, "unit": units[counter]};
    };

    /**
     * Computes the amount of links and the socket colors of an item
     *
     * @param item data, callback
     * @return pass the amount to callback
     */
    var getLinksAmountAndColor = function( item, callback ) {
        // console.time( "Getting link and color" );
        var groups      = {};
        var groupColors = {};
        var colors      = [];
        // For each sockets in the item
        async.each( item.sockets, function( socket, cb ) {
            // If we have a new socket group
            if ( !groups[socket.group] ) {
                groups[socket.group] = 1;
                groupColors[socket.group] = [socket.attr];
            // Otherwise, add a new socket to this group
            } else {
                groups[socket.group]++;
                groupColors[socket.group].push( socket.attr );
            }
            colors.push( socket.attr );
            cb();
        }, function( err ) {
            if ( err ) {
                console.log( err );
            }
            var linkAmount = 0;
            var linkColors = [];
            // Extract largest group
            for ( var key in groups ) {
                if ( groups.hasOwnProperty( key )) {
                    if ( groups[key] > linkAmount ) {
                        linkAmount = groups[key];
                        linkColors = groupColors[key];
                    }
                }
            }
            // console.timeEnd( "Getting link and color" );
            callback({ "linkAmount": linkAmount, "colors": colors, "linkedColors": linkColors });
        });
    };


    /**
     * Extract mods with their values from input item
     *
     * Extract implicit, explicit, crafted and enchanted mods from item.
     * @param item from stash API, callback
     * @return Pass object to callback with extracted mods
     */
    var parseMods = function( item, callback ) {
        // console.time( "Parsing mods" );
        var parsedMods = {};
        var crafted    = false;
        var enchanted  = false;
        if ( item.craftedMods ) {
            crafted    = item.craftedMods.length > 0;
        }
        if ( item.enchantMods ) {
            enchanted  = item.enchantMods.length > 0;
        }
        // console.time( "Parsing mods" );
        // Parse explicit mods
        async.each( item.explicitMods, function( mod, cbMod ) {
            var re = /([0-9\.]+)/g;
            var match = re.exec( mod );
            var matches = [];
            while ( match !== null ) {
                matches.push( parseFloat( match[1]));
                match = re.exec( mod );
            }
            mod = mod.replace( re, "#" );
            parsedMods[mod] = matches;
            cbMod();
        }, function( err ) {
            if ( err ) {
                console.log( "Error: " + err );
            }
            // Parse implicit mods
            async.each( item.implicitMods, function( mod, cbMod ) {
                var re = /([0-9\.]+)/g;
                var match = re.exec( mod );
                var matches = [];
                while ( match !== null ) {
                    matches.push( parseFloat( match[1]));
                    match = re.exec( mod );
                }
                mod = mod.replace( re, "#" );
                parsedMods[mod] = matches;
                cbMod();
            }, function( err ) {
                if ( err ) {
                    console.log( "Error: " + err );
                }
                // Parse crafted mods
                async.each( item.craftedMods, function( mod, cbMod ) {
                    var re = /([0-9\.]+)/g;
                    var match = re.exec( mod );
                    var matches = [];
                    while ( match !== null ) {
                        matches.push( parseFloat( match[1]));
                        match = re.exec( mod );
                    }
                    mod = mod.replace( re, "#" );
                    parsedMods[mod] = matches;
                    cbMod();
                }, function( err ) {
                    if ( err ) {
                        console.log( "Error: " + err );
                    }
                    // Parse enchanted mods
                    async.each( item.enchantMods, function( mod, cbMod ) {
                        var re = /([0-9\.]+)/g;
                        var match = re.exec( mod );
                        var matches = [];
                        while ( match !== null ) {
                            matches.push( parseFloat( match[1]));
                            match = re.exec( mod );
                        }
                        mod = mod.replace( re, "#" );
                        parsedMods[mod] = matches;
                        cbMod();
                    }, function( err ) {
                        if ( err ) {
                            console.log( "Error: " + err );
                        }
                        // console.timeEnd( "Parsing mods" );
                        callback({ 
                            "mods":      parsedMods, 
                            "crafted":   crafted,
                            "enchanted": enchanted
                        });
                    });
                });
            });
        });
    };

    /**
     * Extract properties with their values from input item
     *
     * @param item from stash API, callback
     * @return Pass object to callback with extracted mods
     */
    var parseProperties = function( item, callback ) {
        var itemProperties = {};
        async.each( item.properties, function( property, cbProperty ) {
            if ( property.values.length === 0 ) {
                itemProperties[property.name] = null;
            } else if ( property.values.length === 1 ) {
                itemProperties[property.name] = property.values[0][0];
            } else if ( property.values.length === 2 ) {
                itemProperties[property.name] = [ property.values[0][0], property.values[1][0]];
            }
            cbProperty();
        }, function( err ) {
            if ( err ) {
                console.log( err );
            }
            callback( itemProperties );
        });
    };

    /**
     * Download all public stashes starting with input chunk ID.
     *
     * Download chunk from POE stash API using wget command with compression.
     * Extract downloaded data and check if next chunk is available. If yes,
     * recurse with next chunk ID.
     * @param chunk ID to download
     * @return next chunk ID to download
     */
    var downloadChunk = function( chunkID, callback ) {

        var download = function( chunkID ) {
            // Download compressed gzip data and extract it
            // console.log( "Downloading compressed data[" + chunkID + "]" );
            $( "#current-change-id" ).text( chunkID );
            console.time( "Treating chunk" );
            console.time( "Downloading chunk " + chunkID );
            var begin = Date.now();
            var dataSize = 0;
            var chunkStats;
            // dnscache.lookup( "www.pathofexile.com", function( err, result ) {
                request({ "url": "http://23.246.201.124/api/public-stash-tabs?id=" + chunkID, "gzip": true },
                    function( error, response, body ) {
                        if ( error ) {
                            console.timeEnd( "Downloading chunk " + chunkID );
                            console.log( "Error occured, retrying: " + error );
                            var end = Date.now();
                            // chunkStats = chunkID + "," + ( end - begin ) + "," + dataSize + ",failed\n";
                            // writeChunkStats( chunkStats );
                            setTimeout( download, downloadInterval, chunkID );
                        } else {
                            // console.log( "Downloaded and extracted" );
                            var end = Date.now();
                            console.timeEnd( "Downloading chunk " + chunkID );
                            // chunkStats = chunkID + "," + ( end - begin ) + "," + dataSize + ",passed\n";
                            // writeChunkStats( chunkStats );
                            loadJSON( body );
                        }
                    }
                ).on( "response", function( response ) {
                    response.on( "data", function( data ) {
                        dataSize += data.length;
                    });
                });
            // });
        };

        var loadJSON = function( data ) {
            try {
                // console.time( "Parsing JSON" );
                data = JSON.parse( data, 'utf8' );
                // console.timeEnd( "Parsing JSON" );
                // console.log( "Data loaded" );
                // If we reached the top and next_change_id is null
                if ( !data.next_change_id ) {
                    console.log( "Top reached, waiting" );
                    setTimeout( download, 2000, chunkID );
                } else {
                    console.log( "Next ID: " + data.next_change_id );
                    parseData( data );
                }
            } catch ( e ) {
                console.log( "Error occured, retrying: " + e );
                setTimeout( download, downloadInterval, chunkID );
            }
        };

        var parseData = function( data ) {
            // Store last chunk ID
            console.time( "Total search time" );
            async.each( filters, function( filter, callbackFilter ) {
                // console.time( "Searching in " + nextChunkId + " for " + filter.item );
                // For each stashes in the new data file
                var begin = Date.now();
                var totalItems = 0;
                async.each( data.stashes, function( stash, callbackStash ) {
                    // console.log( data.stashes.length );
                    // If stash is updated, the account is online
                    // If accountName is null, skip

                    /* Insert the league of the item in the DB, no update if the 
                        league already exists */
                    // console.log( stash.items.length );
                    if ( stash.items.length > 0 ) {
                        totalItems += stash.items.length;
                        async.each( stash.items, function( item, callbackItem ) {

                            var itemName = item.name.replace( "<<set:MS>><<set:M>><<set:S>>", "" );
                            var typeLine = item.typeLine.replace( "<<set:MS>><<set:M>><<set:S>>", "" );
                            var name = itemName;
                            if ( itemName === "" ) {
                                name = typeLine;
                            }

                            // if ( !itemName ) {
                            //     itemName = typeLine;
                            // }
                            // console.log( filter.item + " vs " + name );
                            if (( filter.item === "" || itemName === filter.item || typeLine === filter.item ) &&
                                ( filter.league === "any" || item.league === filter.league ) &&
                                ( filter.sockets === "" || filter.sockets <= item.sockets.length ) && 
                                (( filter.corrupted  == 'true' ) === item.corrupted  || filter.corrupted  === "any" ) &&
                                (( filter.enchanted  == 'true' ) === item.enchanted  || filter.enchanted  === "any" ) &&
                                (( filter.crafted    == 'true' ) === item.crafted    || filter.crafted    === "any" ) &&
                                (( filter.identified == 'true' ) === item.identified || filter.identified === "any" ) &&
                                ( filter.level === "" || item.frameType === 4 || ( item.frameType !== 4 && filter.level <= item.ilvl )) && 
                                ( filter.rarity === "any" || filter.rarity == item.frameType ) &&
                                ( filter.itemType === "any" || itemTypes[filter.itemType].types.indexOf( item.typeLine ) !== -1 )
                                ) {

                                // console.log( item );

                                var price = stash.stash;
                                if ( item.note ) {
                                    price = item.note;
                                }
                                priceReg.lastIndex = 0;
                                var match = priceReg.exec( price );
                                // console.log( match );
                                var convertedPrice;
                                var convertedPriceChaos;
                                var currency = "chaos";
                                var originalPrice = "";
                                if ( match ) {
                                    // console.log( match );
                                    if ( match[1] === undefined ) {
                                        originalPrice = ( match[2] / match[3] ) + " " + match[4];
                                        convertedPrice = ( match[2] / match[3] ) * currencyRates[filter.league][match[4]];
                                    } else {
                                        originalPrice = match[1] + " " + match[4];
                                        convertedPrice = match[1] * currencyRates[filter.league][match[4]];
                                    }
                                    
                                    convertedPriceChaos = convertedPrice;
                                    if ( convertedPrice > currencyRates[filter.league].exa ) {
                                        convertedPrice /= currencyRates[filter.league].exa;
                                        currency = "exa";
                                    }
                                    convertedPrice = Math.round( convertedPrice * 100 ) / 100;
                                    // console.log( "Found entry: " + name + " for " + convertedPrice + " " + currency );
                                } else {
                                    // console.log( "Invalid price: " + price );
                                    originalPrice = "Negociate price";
                                }
                                
                                // Convert entry price to chaos and check if within budget
                                if (( convertedPrice && convertedPriceChaos <= filter.budget * currencyRates[filter.league][filter.currency]) || 
                                    ( !convertedPrice && !filter.buyout )) {

                                    // Parse item mods
                                    parseMods( item, function( parsedMods ) {
                                        // console.log( parsedMods );
                                        
                                        // Compare mods from item and filter
                                        var passed = 0;
                                        var keys   = 0;
                                        // Compare mod values to filter
                                        for ( var affix in filter.affixes ) {
                                            if ( filter.affixes.hasOwnProperty( affix )) {
                                                keys++;
                                                // If mod has one parameter
                                                if ( parsedMods.mods[affix] && parsedMods.mods[affix].length === 1 ) {
                                                    if ( parsedMods.mods[affix] && filter.affixes[affix][0] <= parsedMods.mods[affix][0] &&
                                                        filter.affixes[affix][1] >= parsedMods.mods[affix][0]) {
                                                        passed++;
                                                    }
                                                // If mod has two
                                                } else if ( parsedMods.mods[affix] && parsedMods.mods[affix].length === 2 ) {
                                                    var average = ( parsedMods.mods[affix][0] + parsedMods.mods[affix][1]) / 2;
                                                    if ( parsedMods.mods[affix] &&
                                                        filter.affixes[affix][0] <= average &&
                                                        filter.affixes[affix][1] >= average ) {
                                                        passed++;
                                                    }
                                                // Otherwise
                                                } else if ( parsedMods.mods[affix]) {
                                                    passed++;
                                                }
                                                
                                            }
                                        }
                                        if ( passed === keys ) {
                                            parseProperties( item, function( parsedProperties ) {

                                                // DPS calculation
                                                var dps = 0;
                                                var elemental = 0;
                                                var physical  = 0;
                                                // If we have an attack per second property, compute DPS
                                                if ( parsedProperties["Attacks per Second"]) {
                                                    var reg = /([0-9\.]+)-([0-9\.]+)/g;
                                                    if ( parsedProperties["Physical Damage"]) {
                                                        var match = reg.exec( parsedProperties["Physical Damage"]);
                                                        if ( match ) {
                                                            physical = (parseFloat(match[1]) + parseFloat(match[2]))/2;
                                                            item.properties.push({
                                                                name: "pDPS",
                                                                values: [[
                                                                    Math.round( physical * parseFloat( parsedProperties["Attacks per Second"]) * 100 ) / 100
                                                                ]]
                                                            });
                                                            dps += physical;
                                                        } else {
                                                            // console.log( parsedProperties["Physical Damage"]);
                                                        }
                                                    }
                                                    if ( parsedProperties["Elemental Damage"]) {
                                                        var match = reg.exec( parsedProperties["Elemental Damage"]);
                                                        if ( match ) {
                                                            elemental = (parseFloat(match[1]) + parseFloat(match[2]))/2;
                                                            item.properties.push({
                                                                name: "eDPS",
                                                                values: [[
                                                                    Math.round( elemental * parseFloat( parsedProperties["Attacks per Second"]) * 100 ) / 100
                                                                ]]
                                                            });
                                                            dps += elemental;
                                                        } else {
                                                            // console.log( parsedProperties["Elemental Damage"]);
                                                        }
                                                    }
                                                    dps *= parseFloat( parsedProperties["Attacks per Second"]);
                                                    item.properties.push({
                                                        name: "DPS",
                                                        values: [[
                                                            Math.round( dps * 100 ) / 100
                                                        ]]
                                                    });
                                                }

                                            // console.log( parsedProperties );
                                                if (( filter.evasion === "" || 
                                                    parseInt( filter.evasion ) <= parseInt( parsedProperties["Evasion Rating"])) &&
                                                    ( filter.es      === "" || 
                                                    parseInt( filter.es )      <= parseInt( parsedProperties["Energy Shield"])) && 
                                                    ( filter.armor   === "" || 
                                                    parseInt( filter.armor )   <= parseInt( parsedProperties.Armour )) &&
                                                    ( filter.dps === "" || parseFloat( filter.dps ) <= dps ) &&
                                                    ( filter.quality   === "" || 
                                                    parsedProperties.Quality !== undefined &&
                                                    parseInt( filter.quality )   <= parseInt( parsedProperties.Quality.replace( /[\+\%]/g, "" ))) &&
                                                    ( filter.tier   === "" || (
                                                    parsedProperties["Map Tier"] !== undefined && (
                                                    parseInt( filter.tier ) === parseInt( parsedProperties["Map Tier"]) || 
                                                    parseInt( filter.tier ) === item.talismanTier ))) &&
                                                    ( item.frameType !== 4 || filter.level  === "" || (
                                                    item.frameType === 4 && parsedProperties.Level !== undefined &&
                                                    parseInt( filter.level ) <= parseInt( parsedProperties.Level )))
                                                    ) {
                                                    // Check the amount of links
                                                    getLinksAmountAndColor( item, function( res ) {
                                                        if ( res.linkAmount >= filter.links || filter.links === "any" ) {
                                                            var date = new Date();
                                                            var hour = date.getHours() < 10 ? "0" + date.getHours() : date.getHours();
                                                            var min  = date.getMinutes() < 10 ? "0" + date.getMinutes() : date.getMinutes();
                                                            var sec  = date.getSeconds() < 10 ? "0" + date.getSeconds() : date.getSeconds();
                                                            var time = hour + " : " + min + " : " + sec;
                                                            
                                                            // console.log( convertedPriceChaos + " < " + filter.budget * currencyRates[filter.currency] );
                                                            var guid = guidGenerator();
                                                            var implicit   = "";
                                                            var explicit   = "";
                                                            var crafted    = "";
                                                            var enchant    = "";
                                                            var properties = "";
                                                            if ( item.implicitMods ) {
                                                                implicit += "<span class=\"implicit\">";
                                                                implicit += item.implicitMods.join( "</span><br><span class=\"implicit\">" );
                                                                implicit += "</span><br>";
                                                            }
                                                            if ( item.explicitMods ) {
                                                                explicit += "<span class=\"explicit\">";
                                                                explicit += item.explicitMods.join( "</span><br><span class=\"explicit\">" );
                                                                explicit += "</span><br>";
                                                            }
                                                            if ( item.craftedMods ) {
                                                                crafted += "<span class=\"crafted\">";
                                                                crafted += item.craftedMods.join( "</span><br><span class=\"crafted\">" );
                                                                crafted += "</span><br>";
                                                            }
                                                            if ( item.enchantMods ) {
                                                                enchant += "<span class=\"enchant\">";
                                                                enchant += item.enchantMods.join( "</span><br><span class=\"enchant\">" );
                                                                enchant += "</span><br>";
                                                            }
                                                            // console.log( item );
                                                            properties += "<span class=\"property\"><span class=\"col s5 property-title\">Item Level</span><span class=\"col s7 property-value\">" + item.ilvl + "</span></span><br>";
                                                            // for ( var property in parsedProperties ) {
                                                            //     if ( parsedProperties.hasOwnProperty( property )) {
                                                            //         if ( parsedProperties[property] !== null ) {
                                                            //             properties += "<span class=\"property\"><span class=\"col s5 property-title\">" + property.name + "</span><span class=\"col s7 property-value\">" + property.values[0][0] + "</span></span><br>";
                                                            //         } else {
                                                            //             properties += "<span class=\"property\"><span class=\"col s5 property-title\">" + property.name + "</span><span class=\"col s7 property-value\">" + property.values[0][0] + "</span></span><br>";
                                                            //         }
                                                            //     }
                                                            // }
                                                            async.each( item.properties, function( property, cbProperty ) {
                                                                if ( property.values.length > 0 &&  property.values[0].length > 0 ) {
                                                                    properties += "<span class=\"property\"><span class=\"col s5 property-title\">" + property.name + "</span><span class=\"col s7 property-value\">" + property.values[0][0] + "</span></span><br>";
                                                                }
                                                                cbProperty();
                                                            }, function( err ) {
                                                                if ( err ) {
                                                                    console.log( err );
                                                                }
                                                                // console.log( properties );
                                                                var name = itemName;
                                                                if ( itemName === "" ) {
                                                                    name = typeLine;
                                                                }
                                                                // If no b/o price
                                                                if ( !convertedPrice ) {
                                                                    currency = "Negociate price";
                                                                }

                                                                if ( res.linkAmount > 4 ) {
                                                                    name += " " + res.linkAmount + "L";
                                                                }
                                                                var entry = {
                                                                    time:     time,
                                                                    account:  stash.lastCharacterName,
                                                                    item:     name,
                                                                    price:    convertedPrice,
                                                                    currency: currency,
                                                                    originalPrice: originalPrice,
                                                                    itemId:   item.id,
                                                                    id:       guid,
                                                                    icon:     item.icon,
                                                                    implicit: implicit,
                                                                    explicit: explicit,
                                                                    crafted:  crafted,
                                                                    enchant:  enchant,
                                                                    links:    res.linkAmount,
                                                                    league:   item.league
                                                                };
                                                                // If item has not already been added
                                                                var foundIndex = resultsId.indexOf( item.id );
                                                                if ( foundIndex !== -1 ) {
                                                                    $( "li#" + entryLookup[item.id]).css( "opacity", "0.3" );
                                                                }
                                                                entryLookup[item.id] = entry.id;
                                                                results.push( entry );
                                                                resultsId.push( item.id );
                                                                var generated = "";
                                                                mu.compileAndRender( "entry.html", entry )
                                                                .on( "data", function ( data ) {
                                                                    generated += data.toString();
                                                                })
                                                                .on( "end", function () {
                                                                    $( "#results ul" ).prepend( generated );
                                                                    updateResultsAmount();
                                                                    item.accountName = stash.lastCharacterName;
                                                                    item.name = itemName;
                                                                    if ( itemName === "" ) {
                                                                        item.name = typeLine;
                                                                    }
                                                                    
                                                                    item.price = price;
                                                                    item.stashName = stash.stash;
                                                                    $( "#" + guid ).data( "item", item );
                                                                    // Add proper coloring
                                                                    if ( item.frameType === 1 ) {
                                                                        $( "#" + guid + " .item" ).addClass( "magic" );
                                                                    } else if ( item.frameType === 2 ) {
                                                                        $( "#" + guid + " .item" ).addClass( "rare" );
                                                                    } else if ( item.frameType === 3 ) {
                                                                        $( "#" + guid + " .item" ).addClass( "unique" );
                                                                    } else if ( item.frameType === 4 ) {
                                                                        $( "#" + guid + " .item" ).addClass( "gem" );
                                                                    } else if ( item.frameType === 5 ) {
                                                                        $( "#" + guid + " .item" ).addClass( "currency" );
                                                                    } else if ( item.frameType === 6 ) {
                                                                        $( "#" + guid + " .item" ).addClass( "divination" );
                                                                    } else if ( item.frameType === 8 ) {
                                                                        $( "#" + guid + " .item" ).addClass( "prophecy" );
                                                                    } else if ( item.frameType === 9 ) {
                                                                        $( "#" + guid + " .item" ).addClass( "legacy" );
                                                                    } 
                                                                    bindClickEntry( guid );
                                                                    $( "#" + guid + " .implicit-container" ).html( implicit );
                                                                    $( "#" + guid + " .enchant-container" ).html( enchant );
                                                                    $( "#" + guid + " .explicit-container" ).html( explicit );
                                                                    $( "#" + guid + " .crafted-container" ).html( crafted );
                                                                    if ( implicit === "" ) {
                                                                        $( "#" + guid + " .implicit-container" ).hide();
                                                                    }
                                                                    if ( enchant === "" ) {
                                                                        $( "#" + guid + " .enchant-container" ).hide();
                                                                    }
                                                                    if ( crafted === "" ) {
                                                                        $( "#" + guid + " .crafted-container" ).hide();
                                                                    }
                                                                    if ( !item.corrupted ) {
                                                                        $( "#" + guid + " .corrupted" ).hide();
                                                                    }
                                                                    $( "#" + guid + " .properties-container" ).html( properties );
                                                                    // Send notification
                                                                    // notifier.notify('Message');
                                                                    var displayPrice = originalPrice;
                                                                    if ( displayPrice === "Negociate price" ) {
                                                                        displayPrice = "barter";
                                                                    }
                                                                    notifier.notify({
                                                                        title: "Sniped " + name,
                                                                        message: name + " for " + displayPrice
                                                                    }, function ( err ) {
                                                                        if ( err ) {
                                                                            console.log( err );
                                                                        }
                                                                        // Response is response from notification
                                                                        var audio = new Audio( __dirname + '/' + config.sound );
                                                                        audio.volume = config.volume;
                                                                        audio.play();
                                                                    });
                                                                    // If copy to clipboard enabled, do it
                                                                    if ( filter.clipboard ) {
                                                                        formatMessage( item, function( str ) {
                                                                            ncp.copy( str, function() {
                                                                            });
                                                                        });
                                                                    }
                                                                });
                                                            });
                                                        }
                                                    });
                                                } else {
                                                }
                                            });
                                        } else {
                                            // console.log( "Item didn't have sufficient mods" );
                                        }
                                    });
                                }
                                callbackItem();
                            } else {
                                callbackItem();
                            }
                        }, function( err ) {
                            if ( err ) {
                                console.log( err );
                            }
                            // console.log( "Done with item" );
                            callbackStash();
                        });
                    } else {
                        // console.log( "Stash has no items" );
                        callbackStash();
                    }
                
                }, function( err ) {
                    if ( err ) {
                        console.log( err );
                    }
                    // console.log( "Searched among " + totalItems + " items" );
                    var end = Date.now();
                    // var filterStats = filter.id + "," + (end - begin) + "," + totalItems + "\n";
                    // writeFilterStats( filterStats );
                    // console.timeEnd( "Searching in " + nextChunkId + " for " + filter.item );
                    callbackFilter();
                });
            }, function( err ) {
                if ( err ) {
                    console.log( err );
                }
                console.timeEnd( "Total search time" );
                done( data );
            });
        };

        var done = function( data ) {
            console.timeEnd( "Treating chunk" );
            var nextID = data.next_change_id;

            if ( interrupt ) {
                console.log( "Exiting" );
            } else {
                if ( !interrupt ) {
                    // setTimeout( callback, downloadInterval,
                                // nextID, callback );
                    callback( nextID, callback );
                }
            }
        };

        download( chunkID );
    };

    // Main loop
    function main() {
        // Parse argv
        process.argv.forEach(( val, index ) => {
            if ( val === "-d" ) {
                console.log( "Activating debug" );
                debug = true;
            }
        });

        if ( debug ) {
            // write to log.txt
            console.set_use_file( true );
        }

        // Check last downloaded chunk ID
        // lastDownloadedChunk( function( entry ) {
        //     downloadChunk( entry, downloadChunk );
        // });
    }

    process.on('SIGINT', function() {
        console.log( "\rCaught interrupt signal, exiting gracefully" );
        interrupt = true;
    });

    main();
});