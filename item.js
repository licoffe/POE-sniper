/* jshint node: true */
/* jshint jquery: true */
/* jshint esversion: 6 */
"use strict";

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
    static checkUnderpriced( item, currencyRates, itemRates, value, metric, league, callback ) {
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

        var itemLeague = item.league;
        if ( config.useBeta ) {
            itemLeague = "beta-" + itemLeague;
        }
        var prices = {};
        if ( itemLeague === league ) {
            prices = Item.computePrice( item, currencyRates );
        }
        
        if ( prices.originalPrice !== "Negotiate price" && itemLeague === league &&
             name !== "" && prices.convertedPriceChaos > 5 && !item.corrupted ) {
            Item.getLinksAmountAndColor( item, function( res ) {
                var ref = "";
                if ( item.frameType === 3 || item.frameType === 9 ) {
                    ref = name + "_" + ( res.linkAmount <= 4 ? 3 : ( res.linkAmount - 1 )) + "_" + item.frameType;
                } else if ( item.frameType === 5 || item.frameType === 6 || item.frameType === 8 ) {
                    ref = name + "_0_" + item.frameType;
                }
                // If percentage value is not defined, default to 30%
                if ( !value ) {
                    value = 70;
                }
                var metricValueChaos = 0;
                if ( ref && itemRates[itemLeague][ref]) {
                    // console.log( ref + " in " + itemLeague );
                    // console.log( itemRates[itemLeague][ref] );
                    if ( metric === "min_mode_median" ) {
                        metricValueChaos = Math.min( itemRates[itemLeague][ref].mode, itemRates[itemLeague][ref].median );
                    } else if ( metric === "min" ) {
                        metricValueChaos = itemRates[itemLeague][ref].min;
                    } else if ( metric === "mode" ) {
                        metricValueChaos = itemRates[itemLeague][ref].mode;
                    } else if ( metric === "median" ) {
                        metricValueChaos = itemRates[itemLeague][ref].median;
                    }
                }
                
                if ( itemRates[itemLeague][ref] && 
                    ( item.frameType === 3 || item.frameType === 8 || item.frameType === 6 || item.frameType === 9 || item.frameType === 5 ) && 
                    prices.convertedPriceChaos <= metricValueChaos * value / 100 ) {
                    // console.log( item.name + " " + res.linkAmount + "L for " + prices.convertedPriceChaos + " instead of " + (itemRates[itemLeague][ref]) + " in " + itemLeague );
                    Item.parseProperties( item, function( newItem, parsedProperties ) {
                        // console.log( newItem );
                        // If we have an attack per second property, compute DPS
                        if ( parsedProperties["Attacks per Second"]) {
                            var dps = Item.computeDPS( parsedProperties );
                            parsedProperties.DPS = dps.DPS;
                            parsedProperties.pDPS = dps.pDPS;
                            Item.insertDPSValues( newItem, dps, function( item ) {
                                Item.formatItem( item, name, prices, function( newItem ) {
                                    newItem.fullPrice = Math.round( itemRates[itemLeague][ref].mode);
                                    callback( newItem );
                                });
                            });
                        } else {
                            Item.formatItem( newItem, name, prices, function( newItem ) {
                                newItem.fullPrice = Math.round( itemRates[itemLeague][ref].mode);
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
        var total      = "";
        var pseudo     = "";
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
        if ( item.totalMods ) {
            total += "<span class=\"total\">";
            total += item.totalMods.join( "</span><br><span class=\"total\">" );
            total += "</span><br>";
        }
        if ( item.pseudoMods ) {
            pseudo += "<span class=\"pseudo\">";
            pseudo += item.pseudoMods.join( "</span><br><span class=\"pseudo\">" );
            pseudo += "</span><br>";
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
                total:         total,
                pseudo:        pseudo,
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
        var currency         = "chaos";
        var originalPrice    = "";
        var originalAmount   = "";
        var originalCurrency = "";
        var convertedPrice;
        var convertedPriceChaos;
        var league = item.league;
        if ( config.useBeta ) {
            league = "beta-" + league;
        }

        // console.log( JSON.stringify( currencyRates ));

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
                var fraction     = match[2] / match[3];
                originalPrice    = Math.round( fraction * 100 ) / 100 + " " + match[4];
                originalAmount   = Math.round( fraction * 100 ) / 100;
                originalCurrency = match[4];
                // console.log( match[2] + "/" + match[3] + " " + match[4]);
                // Same but convert to chaos: 1/2 exa -> 0.5 x chaos_rate(exa)
                convertedPrice = fraction * currencyRates[league][Currency.shortToLongLookupTable[match[4]]];
            // Otherwise
            } else {
                // console.log( league );
                // console.log( currencyRates[league] );
                // Same thing as above without divisions
                originalPrice    = Math.round( match[1] * 100 ) / 100 + " " + match[4];
                originalAmount   = Math.round( match[1] * 100 ) / 100;
                originalCurrency = match[4];
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
                     originalAmount:      originalAmount,
                     originalCurrency:    originalCurrency,
                     currency:            currency };
        // If there is no price, this is barter
        } else {
            // console.log( "Invalid price: " + price );
            originalPrice = "Negotiate price";
            return { originalPrice: originalPrice };
        }
    }

    static matchPseudoMod( mod, val, tags, callback ) {
        var pseudoMods = {};
        var match = {
            "+#% to Cold Resistance": function( val ) {
                if ( !tags.cold ) {
                    pseudoMods["[PSEUDO] +#% total Resistance"] = val[0];
                    pseudoMods["[PSEUDO] +#% total Elemental Resistance"] = val[0];
                    pseudoMods["[PSEUDO] # Resistances"] = 1;
                    pseudoMods["[PSEUDO] # Elemental Resistances"] = 1;
                    tags.cold = true;
                }
            },
            "+#% to Lightning Resistance": function( val ) {
                if ( !tags.lightning ) {
                    pseudoMods["[PSEUDO] +#% total Resistance"] = val[0];
                    pseudoMods["[PSEUDO] +#% total Elemental Resistance"] = val[0];
                    pseudoMods["[PSEUDO] # Resistances"] = 1;
                    pseudoMods["[PSEUDO] # Elemental Resistances"] = 1;
                    tags.lightning = true;
                }
            },
            "+#% to Fire Resistance": function( val ) {
                if ( !tags.fire ) {
                    pseudoMods["[PSEUDO] +#% total Resistance"] = val[0];
                    pseudoMods["[PSEUDO] +#% total Elemental Resistance"] = val[0];
                    pseudoMods["[PSEUDO] # Resistances"] = 1;
                    pseudoMods["[PSEUDO] # Elemental Resistances"] = 1;
                    tags.fire = true;
                }
            },
            "+#% to Chaos Resistance": function( val ) {
                if ( !tags.chaos ) {
                    pseudoMods["[PSEUDO] +#% total Resistance"] = val[0];
                    pseudoMods["[PSEUDO] # Resistances"] = 1;
                    tags.chaos = true;
                }
            },
            "+#% to all Elemental Resistances": function( val ) {
                if ( !tags.cold ) {
                    pseudoMods["[PSEUDO] +#% total Resistance"] = val[0];
                    pseudoMods["[PSEUDO] +#% total Elemental Resistance"] = val[0];
                    pseudoMods["[PSEUDO] # Resistances"] = 1;
                    pseudoMods["[PSEUDO] # Elemental Resistances"] = 1;
                    tags.cold = true;
                }
                if ( !tags.lightning ) {
                    pseudoMods["[PSEUDO] +#% total Resistance"] += val[0];
                    pseudoMods["[PSEUDO] +#% total Elemental Resistance"] += val[0];
                    pseudoMods["[PSEUDO] # Resistances"] += 1;
                    pseudoMods["[PSEUDO] # Elemental Resistances"] += 1;
                    tags.lightning = true;
                }
                if ( !tags.fire ) {
                    pseudoMods["[PSEUDO] +#% total Resistance"] += val[0];
                    pseudoMods["[PSEUDO] +#% total Elemental Resistance"] += val[0];
                    pseudoMods["[PSEUDO] # Resistances"] += 1;
                    pseudoMods["[PSEUDO] # Elemental Resistances"] += 1;
                    tags.fire = true;
                }
                // pseudoMods["[PSEUDO] +#% total Resistance"] = val[0] * 3;
                // pseudoMods["[PSEUDO] +#% total Elemental Resistance"] = val[0] * 3;
                // pseudoMods["[PSEUDO] # Resistances"] = 3;
                // pseudoMods["[PSEUDO] # Elemental Resistances"] = 3;
                // tags.cold      = true;
                // tags.lightning = true;
                // tags.fire      = true;
            },
            "+#% to Cold and Lightning Resistances": function( val ) {
                if ( !tags.cold ) {
                    pseudoMods["[PSEUDO] +#% total Resistance"] = val[0];
                    pseudoMods["[PSEUDO] +#% total Elemental Resistance"] = val[0];
                    pseudoMods["[PSEUDO] # Resistances"] = 1;
                    pseudoMods["[PSEUDO] # Elemental Resistances"] = 1;
                    tags.cold = true;
                }
                if ( !tags.lightning ) {
                    pseudoMods["[PSEUDO] +#% total Resistance"] += val[0];
                    pseudoMods["[PSEUDO] +#% total Elemental Resistance"] += val[0];
                    pseudoMods["[PSEUDO] # Resistances"] += 1;
                    pseudoMods["[PSEUDO] # Elemental Resistances"] += 1;
                    tags.lightning = true;
                }
                // pseudoMods["[PSEUDO] +#% total Resistance"] = val[0] * 2;
                // pseudoMods["[PSEUDO] +#% total Elemental Resistance"] = val[0] * 2;
                // pseudoMods["[PSEUDO] # Resistances"] = 2;
                // pseudoMods["[PSEUDO] # Elemental Resistances"] = 2;
                // tags.cold      = true;
                // tags.lightning = true;
            },
            "+#% to Fire and Cold Resistances": function( val ) {
                if ( !tags.cold ) {
                    pseudoMods["[PSEUDO] +#% total Resistance"] = val[0];
                    pseudoMods["[PSEUDO] +#% total Elemental Resistance"] = val[0];
                    pseudoMods["[PSEUDO] # Resistances"] = 1;
                    pseudoMods["[PSEUDO] # Elemental Resistances"] = 1;
                    tags.cold = true;
                }
                if ( !tags.fire ) {
                    pseudoMods["[PSEUDO] +#% total Resistance"] += val[0];
                    pseudoMods["[PSEUDO] +#% total Elemental Resistance"] += val[0];
                    pseudoMods["[PSEUDO] # Resistances"] += 1;
                    pseudoMods["[PSEUDO] # Elemental Resistances"] += 1;
                    tags.fire = true;
                }
                // pseudoMods["[PSEUDO] +#% total Resistance"] = val[0] * 2;
                // pseudoMods["[PSEUDO] +#% total Elemental Resistance"] = val[0] * 2;
                // pseudoMods["[PSEUDO] # Resistances"] = 2;
                // pseudoMods["[PSEUDO] # Elemental Resistances"] = 2;
                // tags.cold      = true;
                // tags.fire      = true;
            },
            "+#% to Fire and Lightning Resistances": function( val ) {
                if ( !tags.lightning ) {
                    pseudoMods["[PSEUDO] +#% total Resistance"] = val[0];
                    pseudoMods["[PSEUDO] +#% total Elemental Resistance"] = val[0];
                    pseudoMods["[PSEUDO] # Resistances"] = 1;
                    pseudoMods["[PSEUDO] # Elemental Resistances"] = 1;
                    tags.lightning = true;
                }
                if ( !tags.fire ) {
                    pseudoMods["[PSEUDO] +#% total Resistance"] += val[0];
                    pseudoMods["[PSEUDO] +#% total Elemental Resistance"] += val[0];
                    pseudoMods["[PSEUDO] # Resistances"] += 1;
                    pseudoMods["[PSEUDO] # Elemental Resistances"] += 1;
                    tags.fire = true;
                }
                // pseudoMods["[PSEUDO] +#% total Resistance"] = val[0] * 2;
                // pseudoMods["[PSEUDO] +#% total Elemental Resistance"] = val[0] * 2;
                // pseudoMods["[PSEUDO] # Resistances"] = 2;
                // pseudoMods["[PSEUDO] # Elemental Resistances"] = 2;
                // tags.lightning = true;
                // tags.fire      = true;
            }
        };
        if ( match[mod]) {
            match[mod]( val );
        }
        callback( pseudoMods, tags );
    }

    static matchTotalMod( mod, val, callback ) {
        var totalMods = {};
        var match = {
            // # Life Regenerated per second
            "# Life Regenerated per second": function( val ) {
                totalMods["[TOTAL] # Life Regenerated per second"] = val[0];
            },
            // #% increased Attack Speed
            "#% increased Attack Speed": function( val ) {
                totalMods["[TOTAL] #% increased Attack Speed"] = val[0];
            },
            // #% increased Cast Speed
            "#% increased Cast Speed": function( val ) {
                totalMods["[TOTAL] #% increased Cast Speed"] = val[0];
            },
            "#% increased Attack and Cast Speed": function( val ) {
                totalMods["[TOTAL] #% increased Cast Speed"] = val[0];
                totalMods["[TOTAL] #% increased Attack Speed"] = val[0];
            },
            // #% Elemental damage and spells
            "#% increased Burning Damage": function( val ) {
                totalMods["[TOTAL] #% increased Burning Damage"] = val[0];
            },
            "#% increased Fire Damage": function( val ) {
                totalMods["[TOTAL] #% increased Burning Damage"] = val[0];
                totalMods["[TOTAL] #% increased Fire Damage with Attack Skills"] = val[0];
                totalMods["[TOTAL] #% increased Fire Spell Damage"] = val[0];
                totalMods["[TOTAL] #% increased Fire Area Damage"] = val[0];
            },
            "#% increased Elemental Damage": function( val ) {
                totalMods["[TOTAL] #% increased Burning Damage"] = val[0];
                totalMods["[TOTAL] #% increased Cold Damage with Attack Skills"] = val[0];
                totalMods["[TOTAL] #% increased Fire Damage with Attack Skills"] = val[0];
                totalMods["[TOTAL] #% increased Lightning Damage with Attack Skills"] = val[0];
                totalMods["[TOTAL] #% increased Cold Spell Damage"] = val[0];
                totalMods["[TOTAL] #% increased Fire Spell Damage"] = val[0];
                totalMods["[TOTAL] #% increased Lightning Spell Damage"] = val[0];
                totalMods["[TOTAL] #% increased Elemental Damage with Attack Skills"] = val[0];
                totalMods["[TOTAL] #% increased Fire Area Damage"] = val[0];
            },
            "#% increased Cold Damage": function( val ) {
                totalMods["[TOTAL] #% increased Cold Damage with Attack Skills"] = val[0];
                totalMods["[TOTAL] #% increased Cold Spell Damage"] = val[0];
            },
            "#% increased Elemental Damage with Attack Skills": function( val ) {
                totalMods["[TOTAL] #% increased Cold Damage with Attack Skills"] = val[0];
                totalMods["[TOTAL] #% increased Fire Damage with Attack Skills"] = val[0];
                totalMods["[TOTAL] #% increased Lightning Damage with Attack Skills"] = val[0];
                totalMods["[TOTAL] #% increased Elemental Damage with Attack Skills"] = val[0];
            },
            "#% increased Lightning Damage": function( val ) {
                totalMods["[TOTAL] #% increased Lightning Damage with Attack Skills"] = val[0];
                totalMods["[TOTAL] #% increased Lightning Spell Damage"] = val[0];
            },
            "#% increased Spell Damage": function( val ) {
                totalMods["[TOTAL] #% increased Cold Spell Damage"] = val[0];
                totalMods["[TOTAL] #% increased Fire Spell Damage"] = val[0];
                totalMods["[TOTAL] #% increased Lightning Spell Damage"] = val[0];
                totalMods["[TOTAL] #% increased Spell Damage"] = val[0];
            },
            "#% increased Area Damage": function( val ) {
                totalMods["[TOTAL] #% increased Fire Area Damage"] = val[0];
            },
            // +# to maximum Life
            "+# to maximum Life": function( val ) {
                totalMods["[TOTAL] +# to maximum Life"] = val[0];
            },
            // +# to maximum Mana
            "+# to maximum Mana": function( val ) {
                totalMods["[TOTAL] +# to maximum Mana"] = val[0];
            },
            // #% increased Critical Strike Chance for Spells
            "#% increased Critical Strike Chance for Spells": function( val ) {
                totalMods["[TOTAL] #% increased Critical Strike Chance for Spells"] = val[0];
            },
            "#% increased Global Critical Strike Chance": function( val ) {
                totalMods["[TOTAL] #% increased Critical Strike Chance for Spells"] = val[0];
                totalMods["[TOTAL] #% increased Global Critical Strike Chance"] = val[0];
            },
            "#% increased Mana Regeneration Rate": function( val ) {
                totalMods["[TOTAL] #% increased Mana Regeneration Rate"] = val[0];
            },
            "#% increased maximum Energy Shield": function( val ) {
                totalMods["[TOTAL] #% increased maximum Energy Shield"] = val[0];
            },
            "#% increased Physical Damage": function( val ) {
                totalMods["[TOTAL] #% increased Physical Damage"] = val[0];
            },
            "#% increased Rarity of Items found": function( val ) {
                totalMods["[TOTAL] #% increased Rarity of Items found"] = val[0];
            },
            "#% of Physical Attack Damage Leeched as Life": function( val ) {
                totalMods["[TOTAL] #% of Physical Attack Damage Leeched as Life"] = val[0];
            },
            "+# to all Attributes": function( val ) {
                totalMods["[TOTAL] +# to all Attributes"] = val[0];
                totalMods["[TOTAL] +# to Dexterity"] = val[0];
                totalMods["[TOTAL] +# to Intelligence"] = val[0];
                totalMods["[TOTAL] +# to Strength"] = val[0];
                totalMods["[TOTAL] +# to maximum Life"] = Math.floor( val[0] / 2 );
                totalMods["[TOTAL] +# to maximum Mana"] = Math.floor( val[0] / 2 );
            },
            "+# to Dexterity": function( val ) {
                totalMods["[TOTAL] +# to Dexterity"] = val[0];
            },
            "+# to Intelligence": function( val ) {
                totalMods["[TOTAL] +# to Intelligence"] = val[0];
                totalMods["[TOTAL] +# to maximum Mana"] = Math.floor( val[0] / 2 );
            },
            "+# to Strength": function( val ) {
                totalMods["[TOTAL] +# to Strength"] = val[0];
                totalMods["[TOTAL] +# to maximum Life"] = Math.floor( val[0] / 2 );
            },
            "+# to Dexterity and Intelligence": function( val ) {
                totalMods["[TOTAL] +# to Dexterity"] = val[0];
                totalMods["[TOTAL] +# to Intelligence"] = val[0];
                totalMods["[TOTAL] +# to maximum Mana"] = Math.floor( val[0] / 2 );
            },
            "+# to Strength and Dexterity": function( val ) {
                totalMods["[TOTAL] +# to Dexterity"] = val[0];
                totalMods["[TOTAL] +# to Strength"] = val[0];
                totalMods["[TOTAL] +# to maximum Life"] = Math.floor( val[0] / 2 );
            },
            "+# to Strength and Intelligence": function( val ) {
                totalMods["[TOTAL] +# to Strength"] = val[0];
                totalMods["[TOTAL] +# to Intelligence"] = val[0];
                totalMods["[TOTAL] +# to maximum Life"] = Math.floor( val[0] / 2 );
                totalMods["[TOTAL] +# to maximum Mana"] = Math.floor( val[0] / 2 );
            },
            "+# to Level of Socketed Gems": function( val ) {
                totalMods["[TOTAL] +# to Level of Socketed Aura Gems"] = val[0];
                totalMods["[TOTAL] +# to Level of Socketed Bow Gems"] = val[0];
                totalMods["[TOTAL] +# to Level of Socketed Chaos Gems"] = val[0];
                totalMods["[TOTAL] +# to Level of Socketed Fire Gems"] = val[0];
                totalMods["[TOTAL] +# to Level of Socketed Cold Gems"] = val[0];
                totalMods["[TOTAL] +# to Level of Socketed Lightning Gems"] = val[0];
                totalMods["[TOTAL] +# to Level of Socketed Elemental Gems"] = val[0];
                totalMods["[TOTAL] +# to Level of Socketed Melee Gems"] = val[0];
                totalMods["[TOTAL] +# to Level of Socketed Minion Gems"] = val[0];
                totalMods["[TOTAL] +# to Level of Socketed Movement Gems"] = val[0];
                totalMods["[TOTAL] +# to Level of Socketed Spell Gems"] = val[0];
                totalMods["[TOTAL] +# to Level of Socketed Strength Gems"] = val[0];
                totalMods["[TOTAL] +# to Level of Socketed Vaal Gems"] = val[0];
            },
            "+# to Level of Socketed Aura Gems": function( val ) {
                totalMods["[TOTAL] +# to Level of Socketed Aura Gems"] = val[0];
            },
            "+# to Level of Socketed Bow Gems": function( val ) {
                totalMods["[TOTAL] +# to Level of Socketed Bow Gems"] = val[0];
            },
            "+# to Level of Socketed Chaos Gems": function( val ) {
                totalMods["[TOTAL] +# to Level of Socketed Chaos Gems"] = val[0];
            },
            "+# to Level of Socketed Fire Gems": function( val ) {
                totalMods["[TOTAL] +# to Level of Socketed Fire Gems"] = val[0];
            },
            "+# to Level of Socketed Cold Gems": function( val ) {
                totalMods["[TOTAL] +# to Level of Socketed Cold Gems"] = val[0];
            },
            "+# to Level of Socketed Lightning Gems": function( val ) {
                totalMods["[TOTAL] +# to Level of Socketed Lightning Gems"] = val[0];
            },
            "+# to Level of Socketed Elemental Gems": function( val ) {
                totalMods["[TOTAL] +# to Level of Socketed Elemental Gems"] = val[0];
            },
            "+# to Level of Socketed Melee Gems": function( val ) {
                totalMods["[TOTAL] +# to Level of Socketed Melee Gems"] = val[0];
            },
            "+# to Level of Socketed Minion Gems": function( val ) {
                totalMods["[TOTAL] +# to Level of Socketed Minion Gems"] = val[0];
            },
            "+# to Level of Socketed Movement Gems": function( val ) {
                totalMods["[TOTAL] +# to Level of Socketed Movement Gems"] = val[0];
            },
            "+# to Level of Socketed Spell Gems": function( val ) {
                totalMods["[TOTAL] +# to Level of Socketed Spell Gems"] = val[0];
            },
            "+# to Level of Socketed Strength Gems": function( val ) {
                totalMods["[TOTAL] +# to Level of Socketed Strength Gems"] = val[0];
            },
            "+# to Level of Socketed Vaal Gems": function( val ) {
                totalMods["[TOTAL] +# to Level of Socketed Vaal Gems"] = val[0];
            },
            "+# to maximum Energy Shield": function( val ) {
                totalMods["[TOTAL] +# to maximum Energy Shield"] = val[0];
            },
            "+#% to all Elemental Resistances": function( val ) {
                totalMods["[TOTAL] +#% to all Elemental Resistances"] = val[0];
                totalMods["[TOTAL] +#% to Cold Resistance"] = val[0];
                totalMods["[TOTAL] +#% to Fire Resistance"] = val[0];
                totalMods["[TOTAL] +#% to Lightning Resistance"] = val[0];
            },
            "+#% to Cold Resistance": function( val ) {
                totalMods["[TOTAL] +#% to Cold Resistance"] = val[0];
            },
            "+#% to Fire Resistance": function( val ) {
                totalMods["[TOTAL] +#% to Fire Resistance"] = val[0];
            },
            "+#% to Lightning Resistance": function( val ) {
                totalMods["[TOTAL] +#% to Lightning Resistance"] = val[0];
            },
            "+#% to Fire and Cold Resistances": function( val ) {
                totalMods["[TOTAL] +#% to Fire Resistance"] = val[0];
                totalMods["[TOTAL] +#% to Cold Resistance"] = val[0];
            },
            "+#% to Cold and Lightning Resistances": function( val ) {
                totalMods["[TOTAL] +#% to Lightning Resistance"] = val[0];
                totalMods["[TOTAL] +#% to Cold Resistance"] = val[0];
            },
            "+#% to Fire and Lightning Resistances": function( val ) {
                totalMods["[TOTAL] +#% to Lightning Resistance"] = val[0];
                totalMods["[TOTAL] +#% to Fire Resistance"] = val[0];
            },
            "+#% to Global Critical Strike Multiplier": function( val ) {
                totalMods["[TOTAL] +#% to Global Critical Strike Multiplier"] = val[0];
            },
            "Adds # to # Fire Damage": function( val ) {
                totalMods["[TOTAL] Adds # Damage to Attacks"] = ( val[0] + val[1]) / 2;
                totalMods["[TOTAL] Adds # Elemental Damage to Attacks"] = ( val[0] + val[1]) / 2;
                totalMods["[TOTAL] Adds # Fire Damage to Attacks"] = ( val[0] + val[1]) / 2;
            },
            "Adds # to # Fire Damage to Attacks": function( val ) {
                totalMods["[TOTAL] Adds # Damage to Attacks"] = ( val[0] + val[1]) / 2;
                totalMods["[TOTAL] Adds # Elemental Damage to Attacks"] = ( val[0] + val[1]) / 2;
                totalMods["[TOTAL] Adds # Fire Damage to Attacks"] = ( val[0] + val[1]) / 2;
            },
            "Adds # to # Lightning Damage to Attacks": function( val ) {
                totalMods["[TOTAL] Adds # Damage to Attacks"] = ( val[0] + val[1]) / 2;
                totalMods["[TOTAL] Adds # Elemental Damage to Attacks"] = ( val[0] + val[1]) / 2;
                totalMods["[TOTAL] Adds # Lightning Damage to Attacks"] = ( val[0] + val[1]) / 2;
            },
            "Adds # to # Lightning Damage": function( val ) {
                totalMods["[TOTAL] Adds # Damage to Attacks"] = ( val[0] + val[1]) / 2;
                totalMods["[TOTAL] Adds # Elemental Damage to Attacks"] = ( val[0] + val[1]) / 2;
                totalMods["[TOTAL] Adds # Lightning Damage to Attacks"] = ( val[0] + val[1]) / 2;
            },
            "Adds # to # Cold Damage": function( val ) {
                totalMods["[TOTAL] Adds # Damage to Attacks"] = ( val[0] + val[1]) / 2;
                totalMods["[TOTAL] Adds # Elemental Damage to Attacks"] = ( val[0] + val[1]) / 2;
                totalMods["[TOTAL] Adds # Cold Damage to Attacks"] = ( val[0] + val[1]) / 2;
            },
            "Adds # to # Cold Damage to Attacks": function( val ) {
                totalMods["[TOTAL] Adds # Damage to Attacks"] = ( val[0] + val[1]) / 2;
                totalMods["[TOTAL] Adds # Elemental Damage to Attacks"] = ( val[0] + val[1]) / 2;
                totalMods["[TOTAL] Adds # Cold Damage to Attacks"] = ( val[0] + val[1]) / 2;
            },
            "Adds # to # Physical Damage": function( val ) {
                totalMods["[TOTAL] Adds # Damage to Attacks"] = ( val[0] + val[1]) / 2;
                totalMods["[TOTAL] Adds # Physical Damage to Attacks"] = ( val[0] + val[1]) / 2;
            },
            "Adds # to # Physical Damage to Attacks": function( val ) {
                totalMods["[TOTAL] Adds # Damage to Attacks"] = ( val[0] + val[1]) / 2;
                totalMods["[TOTAL] Adds # Physical Damage to Attacks"] = ( val[0] + val[1]) / 2;
            },
            "Adds # to # Chaos Damage to Attacks": function( val ) {
                totalMods["[TOTAL] Adds # Damage to Attacks"] = ( val[0] + val[1]) / 2;
            },
            "Adds # to # Chaos Damage": function( val ) {
                totalMods["[TOTAL] Adds # Damage to Attacks"] = ( val[0] + val[1]) / 2;
            },
            "Adds # to # Lightning Damage to Spells": function( val ) {
                totalMods["[TOTAL] Adds # Damage to Spells"] = ( val[0] + val[1]) / 2;
                totalMods["[TOTAL] Adds # Elemental Damage to Spells"] = ( val[0] + val[1]) / 2;
            },
            "Adds # to # Cold Damage to Spells": function( val ) {
                totalMods["[TOTAL] Adds # Damage to Spells"] = ( val[0] + val[1]) / 2;
                totalMods["[TOTAL] Adds # Elemental Damage to Spells"] = ( val[0] + val[1]) / 2;
            },
            "Adds # to # Fire Damage to Spells": function( val ) {
                totalMods["[TOTAL] Adds # Damage to Spells"] = ( val[0] + val[1]) / 2;
                totalMods["[TOTAL] Adds # Elemental Damage to Spells"] = ( val[0] + val[1]) / 2;
            },
            "Adds # to # Chaos Damage to Spells": function( val ) {
                totalMods["[TOTAL] Adds # Damage to Spells"] = ( val[0] + val[1]) / 2;
            }
        };
        if ( match[mod]) {
            match[mod]( val );
        }
        callback( totalMods );
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
        var totalMods  = {};
        var pseudoMods = {};
        var tags       = {};
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
            Item.matchTotalMod( mod, matches, function( total ) {
                for ( var p in total ) {
                    if ( total.hasOwnProperty( p )) {
                        if ( !totalMods[p]) {
                            totalMods[p] = total[p];
                        } else {
                            totalMods[p] += total[p];
                        }
                    }
                }
            });
            Item.matchPseudoMod( mod, matches, tags, function( pseudo, tags ) {
                tags = tags;
                for ( var p in pseudo ) {
                    if ( pseudo.hasOwnProperty( p )) {
                        if ( !pseudoMods[p]) {
                            pseudoMods[p] = pseudo[p];
                        } else {
                            pseudoMods[p] += pseudo[p];
                        }
                    }
                }
            });
            // If mod already exists (for example, implicit + explicit)
            if ( parsedMods[mod]) {
                for ( var i = 0 ; i < matches.length ; i++ ) {
                    parsedMods[mod][i] += matches[i];
                }
            } else {
                parsedMods[mod] = matches;
            }
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
                Item.matchTotalMod( mod, matches, function( total ) {
                    for ( var p in total ) {
                        if ( total.hasOwnProperty( p )) {
                            if ( !totalMods[p]) {
                                totalMods[p] = total[p];
                            } else {
                                totalMods[p] += total[p];
                            }
                        }
                    }
                });
                Item.matchPseudoMod( mod, matches, tags, function( pseudo, tags ) {
                    tags = tags;
                    for ( var p in pseudo ) {
                        if ( pseudo.hasOwnProperty( p )) {
                            if ( !pseudoMods[p]) {
                                pseudoMods[p] = pseudo[p];
                            } else {
                                pseudoMods[p] += pseudo[p];
                            }
                        }
                    }
                });
                // If mod already exists (for example, implicit + explicit)
                if ( parsedMods[mod]) {
                    for ( var i = 0 ; i < matches.length ; i++ ) {
                        parsedMods[mod][i] += matches[i];
                    }
                } else {
                    parsedMods[mod] = matches;
                }
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
                    Item.matchTotalMod( mod, matches, function( total ) {
                        for ( var p in total ) {
                            if ( total.hasOwnProperty( p )) {
                                if ( !totalMods[p]) {
                                    totalMods[p] = total[p];
                                } else {
                                    totalMods[p] += total[p];
                                }
                            }
                        }
                    });
                    Item.matchPseudoMod( mod, matches, tags, function( pseudo, tags ) {
                        tags = tags;
                        for ( var p in pseudo ) {
                            if ( pseudo.hasOwnProperty( p )) {
                                if ( !pseudoMods[p]) {
                                    pseudoMods[p] = pseudo[p];
                                } else {
                                    pseudoMods[p] += pseudo[p];
                                }
                            }
                        }
                    });
                    // If mod already exists (for example, implicit + explicit)
                    if ( parsedMods[mod]) {
                        for ( var i = 0 ; i < matches.length ; i++ ) {
                            parsedMods[mod][i] += matches[i];
                        }
                    } else {
                        parsedMods[mod] = matches;
                    }
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
                        // If mod already exists (for example, implicit + explicit)
                        if ( parsedMods[mod]) {
                            for ( var i = 0 ; i < matches.length ; i++ ) {
                                parsedMods[mod][i] += matches[i];
                            }
                        } else {
                            parsedMods[mod] = matches;
                        }
                        cbMod();
                    }, function( err ) {
                        if ( err ) {
                            console.log( "Error: " + err );
                        }
                        var mod;
                        // console.timeEnd( "Parsing mods" );
                        // Add total mods to parsedMods to compare later on
                        for ( mod in totalMods ) {
                            if ( totalMods.hasOwnProperty( mod )) {
                                parsedMods[mod] = [totalMods[mod]];
                            }
                        }
                        // Same for pseudo mods
                        for ( mod in pseudoMods ) {
                            if ( pseudoMods.hasOwnProperty( mod )) {
                                parsedMods[mod] = [pseudoMods[mod]];
                            }
                        }
                        callback({ 
                            "mods":       parsedMods,
                            "totalMods":  totalMods,
                            "pseudoMods": pseudoMods,
                            "crafted":    crafted,
                            "enchanted":  enchanted
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
        var match = "";
        if ( itemProperties["Physical Damage"]) {
            match = reg.exec( itemProperties["Physical Damage"]);
            if ( match ) {
                physical = (parseFloat(match[1]) + parseFloat(match[2]))/2;
                dps += physical;
            }
        }
        if ( itemProperties["Elemental Damage"]) {
            match = reg.exec( itemProperties["Elemental Damage"]);
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
                    rates[league][rate.name + "_" + rate.links + "_" + rate.frameType]        = {};
                    rates[league][rate.name + "_" + rate.links + "_" + rate.frameType].min    = parseFloat(rate.min);
                    rates[league][rate.name + "_" + rate.links + "_" + rate.frameType].mode   = parseFloat(rate.mode);
                    rates[league][rate.name + "_" + rate.links + "_" + rate.frameType].median = parseFloat(rate.median);
                    // rates[league][rate.name + "_" + rate.links + "_" + rate.quality + "_" + rate.level + "_" + rate.corrupted] = rate.median;
                    // var value = parseFloat(rate.mode) < parseFloat(rate.median) ? parseFloat(rate.mode) : parseFloat(rate.median);
                    // console.log( rate.name + "(" + league + ") " + rate.mode + " < " + rate.median + ": " + ( rate.mode < rate.median ) + " -> " + value );
                    // rates[league][rate.name + "_" + rate.links + "_" + rate.frameType] = value;
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