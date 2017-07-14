/**
 * Item class
 *
 * Extract mods, properties and socket information from items
 * @params Nothing
 * @return Item object
 */

var async    = require( "async" );
const {app}  = require( "electron" ).remote;
const path   = require( "path" );
var config   = require( app.getPath( "userData" ) + path.sep + "config.json" );
// Item price RegExp
var priceReg = /(?:([0-9\.]+)|([0-9]+)\/([0-9]+)) ([a-z]+)/g;
var Misc     = require( "./misc.js" );
var Currency = require( "./currency.js" );

class Item {

    /**
     * Update item entry with dps values
     *
     * @params Item, DPS, callback
     * @return Item with DPS values through callback
     */
    static insertDPSValues( item, dps, callback ) {
        if ( dps.pDPS ) {
            item.properties.push({
                name: "pDPS",
                values: [[dps.pDPS]]
            });
        }
        if ( dps.eDPS ) {
            item.properties.push({
                name: "eDPS",
                values: [[dps.eDPS]]
            });
        }
        if ( dps.DPS ) {
            item.properties.push({
                name: "DPS",
                values: [[dps.DPS]]
            });
        }
        callback( item );
    }

    /**
     * Check if item is underpriced
     *
     * @params Item to check against, currency rates, itemRates, callback
     * @return item through callback
     */
    static checkUnderpriced( item, currencyRates, itemRates, callback ) {
        var self = this;

        // Clean up the item name and typeLine
        item.name     = item.name.replace( "<<set:MS>><<set:M>><<set:S>>", "" );
        item.typeLine = item.typeLine.replace( "<<set:MS>><<set:M>><<set:S>>", "" );
        var itemName  = item.name.replace( "<<set:MS>><<set:M>><<set:S>>", "" );
        var typeLine  = item.typeLine.replace( "<<set:MS>><<set:M>><<set:S>>", "" );
        var name      = itemName;
        // If item name is empty, the name is the type instead
        if ( itemName === "" ) {
            name = typeLine;
        }

        var prices = Item.computePrice( item, currencyRates );
        var itemLeague = item.league;
        if ( config.useBeta ) {
            itemLeague = "beta-" + itemLeague;
        }
        if ( prices.originalPrice !== "Negotiate price" && itemName !== "" && prices.convertedPriceChaos > 5 && !item.corrupted ) {
            Item.getLinksAmountAndColor( item, function( res ) {

                var ref = itemName + "_" + ( res.linkAmount <= 4 ? 3 : ( res.linkAmount - 1 )) + "_" + item.frameType;
                if ( item.frameType === 3 && itemRates[itemLeague][ref] && prices.convertedPriceChaos <= itemRates[itemLeague][ref] * 70 / 100 ) {
                    console.log( item.name + " " + res.linkAmount + "L for " + prices.convertedPriceChaos + " instead of " + (itemRates[itemLeague][ref]) + " in " + itemLeague );
                    Item.parseProperties( item, function( newItem, parsedProperties ) {
                        // console.log( newItem );
                        // If we have an attack per second property, compute DPS
                        if ( parsedProperties["Attacks per Second"]) {
                            var dps = Item.computeDPS( parsedProperties );
                            parsedProperties.DPS = dps.DPS;
                            parsedProperties.pDPS = dps.pDPS;
                            Item.insertDPSValues( newItem, dps, function( item ) {
                                Item.formatItem( item, name, prices, function( newItem ) {
                                    newItem.fullPrice = Math.round( itemRates[itemLeague][ref]);
                                    callback( newItem );
                                });
                            });
                        } else {
                            Item.formatItem( newItem, name, prices, function( newItem ) {
                                newItem.fullPrice = Math.round( itemRates[itemLeague][ref]);
                                callback( newItem );
                            });
                        }
                    });
                } else {
                    callback( false );
                }
            });
        } else {
            callback( false );
        }
    }
        

    /**
     * Computes the amount of links and the socket colors of an item
     *
     * @param item data, callback
     * @return pass the amount and colors to callback
     */
    static getLinksAmountAndColor( item, callback ) {
        var groups      = {};
        var groupColors = {};
        var colors      = [];
        var colorCount  = {};
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
            if ( !colorCount[socket.attr]) {
                colorCount[socket.attr] = 0;
            }
            colorCount[socket.attr]++;
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
            callback({ "linkAmount":   linkAmount, 
                       "colors":       colors, 
                       "linkedColors": linkColors,
                       "colorCount":   colorCount
            });
        });
    }

    /**
     * Format time to display on the interface
     *
     * @params Nothing
     * @return Formatted time
     */
    static formatTime() {
        var date = new Date();
        var hour = date.getHours()   < 10 ? "0" + date.getHours()   : date.getHours();
        var min  = date.getMinutes() < 10 ? "0" + date.getMinutes() : date.getMinutes();
        var sec  = date.getSeconds() < 10 ? "0" + date.getSeconds() : date.getSeconds();
        
        return hour + " : " + min + " : " + sec;
    }

    /**
     * Format item to display in the results
     *
     * @params  Item, item name, prices and callback
     * @returns Formatted item through callback
     */
    static formatItem( item, name, prices, callback ) {
        var time       = Item.formatTime();
        var guid       = Misc.guidGenerator();
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

        async.each( item.properties, function( property, cbProperty ) {
            // console.log( property );
            if ( property.values.length > 0 && property.values[0].length > 0 ) {
                properties += "<span class=\"property\"><span class=\"col s5 property-title\">" + property.name + "</span><span class=\"col s7 property-value\">" + property.values[0][0] + "</span></span><br>";
            }
            cbProperty();
        }, function( err ) {
            if ( err ) {
                console.log( err );
            }
            
            // If no b/o price
            if ( !prices.convertedPrice ) {
                prices.currency = "Negotiate price";
            }
            var whisperName = name;
            if ( item.linkAmount > 4 ) {
                name += " " + item.linkAmount + "L";
            }
            var itemType = item.typeLine.replace( "<<set:MS>><<set:M>><<set:S>>", "" );
            if ( itemType === whisperName ) {
                if ( item.frameType === 4 ) {
                    itemType = "Gem";
                } else if ( item.frameType === 5 ) {
                    itemType = "Currency";
                } else if ( item.frameType === 6 ) {
                    itemType = "Divination Card";
                } else if ( item.frameType === 8 ) {
                    itemType = "Prophecy";
                } else if ( name.indexOf( "Leaguestone" ) !== -1 ) {
                    itemType = "Leaguestone";
                } else if ( item.frameType === 1 ) {
                    itemType = "";
                }
            } else {
                whisperName += " " + itemType;
            }

            // If beta is used, add full path to icon
            var imageDomain = "";
            if ( config.useBeta ) {
                imageDomain = "http://web.poecdn.com/";
            }
            
            callback({
                time:          time,
                account:       item.lastCharacterName,
                item:          name,
                whisperName:   whisperName,
                frameType:     item.frameType,
                price:         prices.convertedPrice,
                currency:      prices.currency,
                originalPrice: prices.originalPrice,
                itemId:        item.id,
                id:            guid,
                icon:          imageDomain + item.icon,
                implicit:      implicit,
                explicit:      explicit,
                crafted:       crafted,
                corrupted:     item.corrupted,
                enchant:       enchant,
                properties:    properties,
                links:         item.linkAmount,
                league:        item.league,
                stashTab:      item.stashTab,
                left:          item.x,
                top:           item.y,
                typeLine:      item.typeLine,
                sockets:       item.sockets,
                type:          itemType
            });
        });
    }

    /**
     * Compute item price
     *
     * @params Item, currencyRates
     * @return Price
     */
    static computePrice( item, currencyRates ) {
        // Default currency is chaos
        var currency = "chaos";
        var originalPrice = "";
        var convertedPrice;
        var convertedPriceChaos;
        var league = item.league;
        if ( config.useBeta ) {
            league = "beta-" + league;
        }

        // The price is the name of the stash
        var price = item.stashTab;
        // If item has a note, the price is the note instead
        if ( item.note ) {
            price = item.note;
        }
        priceReg.lastIndex = 0;
        var match = priceReg.exec( price );

        // If the price is recognized by the RegExp
        if ( match ) {
            // and if the price is a fraction
            if ( match[1] === undefined ) {
                // Compute the fraction: 1/2 exa -> 0.5 exa
                originalPrice = Math.round( match[2] / match[3] * 100 ) / 100 + " " + match[4];
                // console.log( match[2] + "/" + match[3] + " " + match[4]);
                // Same but convert to chaos: 1/2 exa -> 0.5 x chaos_rate(exa)
                convertedPrice = ( match[2] / match[3] ) * currencyRates[league][Currency.shortToLongLookupTable[match[4]]];
            // Otherwise
            } else {
                // Same thing as above without divisions
                originalPrice  = Math.round( match[1] * 100 ) / 100 + " " + match[4];
                // console.log( match[1] + " " + match[4]);
                convertedPrice = match[1] * currencyRates[league][Currency.shortToLongLookupTable[match[4]]];
            }
            
            convertedPriceChaos = convertedPrice;
            // If the converted price is above the rate of exalted orbs in this league
            // convert the price to exalted instead
            if ( convertedPrice > currencyRates[league].exa ) {
                convertedPrice /= currencyRates[league].exa;
                currency = "exa";
            }
            // Round up the price to .00 precision
            convertedPrice = Math.round( convertedPrice * 100 ) / 100;
            // console.log( "Found entry: " + name + " for " + convertedPriceChaos + ":" + convertedPrice + " " + currency + " (" + originalPrice + ")" );

            return { convertedPrice:      convertedPrice, 
                     convertedPriceChaos: convertedPriceChaos,
                     originalPrice:       originalPrice,
                     currency:            currency };
        // If there is no price, this is barter
        } else {
            // console.log( "Invalid price: " + price );
            originalPrice = "Negotiate price";
            return { originalPrice: originalPrice };
        }
    }

    /**
     * Extract mods with their values from input item
     *
     * Extract implicit, explicit, crafted and enchanted mods from item.
     * @param item from stash API, callback
     * @return Pass object to callback with extracted mods
     */
    static parseMods( item, callback ) {
        var parsedMods = {};
        var crafted    = false;
        var enchanted  = false;
        if ( item.craftedMods ) {
            crafted    = item.craftedMods.length > 0;
        }
        if ( item.enchantMods ) {
            enchanted  = item.enchantMods.length > 0;
        }
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
    }

    /**
     * Extract properties with their values from input item
     *
     * @param item from stash API, callback
     * @return Pass object to callback with extracted mods
     */
    static parseProperties( item, callback ) {
        var itemProperties = {};
        var newItem = item;
        async.each( newItem.properties, function( property, cbProperty ) {
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
            async.each( newItem.additionalProperties, function( addProperty, cbAddProperty ) {
                if ( addProperty.name === "Experience" ) {
                    itemProperties[addProperty.name] = Math.round( addProperty.progress * 10000 ) / 100;
                    newItem.properties.push({
                        name: "Experience",
                        values: [[Math.round( addProperty.progress * 10000 ) / 100]]
                    });
                } else {
                    if ( addProperty.values.length === 0 ) {
                        itemProperties[addProperty.name] = null;
                    } else if ( addProperty.values.length === 1 ) {
                        itemProperties[addProperty.name] = addProperty.values[0][0];
                    } else if ( addProperty.values.length === 2 ) {
                        itemProperties[addProperty.name] = [ addProperty.values[0][0], addProperty.values[1][0]];
                    }
                    newItem.properties.push({
                        name: addProperty.name,
                        values: [[itemProperties[addProperty.name]]]
                    });
                }
                cbAddProperty();
            }, function( err ) {
                if ( err ) {
                    console.log( err );
                }
                callback( newItem, itemProperties );
            });
        });
    }

    /**
     * Compute Physical, Elemental and Total DPS
     *
     * @params Item properties
     * @return DPS values
     */
    static computeDPS( itemProperties ) {
        var dps       = 0;
        var physical  = 0;
        var elemental = 0;
        var reg = /([0-9\.]+)-([0-9\.]+)/g;
        if ( itemProperties["Physical Damage"]) {
            var match = reg.exec( itemProperties["Physical Damage"]);
            if ( match ) {
                physical = (parseFloat(match[1]) + parseFloat(match[2]))/2;
                dps += physical;
            }
        }
        if ( itemProperties["Elemental Damage"]) {
            var match = reg.exec( itemProperties["Elemental Damage"]);
            if ( match ) {
                elemental = (parseFloat(match[1]) + parseFloat(match[2]))/2;
                dps += elemental;
            }
        }
        dps       = Math.round( dps       * parseFloat( itemProperties["Attacks per Second"]) * 100 ) / 100;
        physical  = Math.round( physical  * parseFloat( itemProperties["Attacks per Second"]) * 100 ) / 100;
        elemental = Math.round( elemental * parseFloat( itemProperties["Attacks per Second"]) * 100 ) / 100;

        return {
            "pDPS": physical,
            "eDPS": elemental,
            "DPS" : dps 
        };
    }

    /**
     * Fetch last item rates from poe-rates.com API
     *
     * Fetch item rates in chaos for each leagues from
     * the poe-rates API.
     * @params callback
     * @return return rates through callback
     */
    static getLastRates( callback ) {
        // console.log( "Downloading last rates from poe-rates.com" );
        var rates = {};

        // For each league
        async.each( config.leagues, function( league, cbLeague ) {
            rates[league] = {};
            $.get( "http://poe-rates.com/actions/getLastItemRates.php", {
                league: league
            }, function( data ) {
                var parsed = $.parseJSON( data );
                async.each( parsed.rates, function( rate, cbRate ) {
                    // rates[league][rate.name + "_" + rate.links + "_" + rate.quality + "_" + rate.level + "_" + rate.corrupted] = rate.median;
                    var value = parseFloat(rate.mode) < parseFloat(rate.median) ? parseFloat(rate.mode) : parseFloat(rate.median);
                    // console.log( rate.name + "(" + league + ") " + rate.mode + " < " + rate.median + ": " + ( rate.mode < rate.median ) + " -> " + value );
                    rates[league][rate.name + "_" + rate.links + "_" + rate.frameType] = value;
                    cbRate();
                }, function() {
                    cbLeague();
                });
            });
        }, function( err ) {
            if ( err ) {
                console.log( err );
            }
            callback( rates );
        });
    }

}

module.exports = Item;