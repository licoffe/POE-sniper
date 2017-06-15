/**
 * Filter class
 *
 * Filter representation
 * @params Nothing
 * @return Filter object
 */

var async    = require( "async" );
var mu       = require( 'mu2' );
mu.root      = __dirname + '/templates';
var config   = require( "./config.json" );
// Item price RegExp
var priceReg = /(?:([0-9\.]+)|([0-9]+)\/([0-9]+)) ([a-z]+)/g;
var Item     = require( "./item.js" );
var Misc     = require( "./misc.js" );
var itemTypes = require( "./itemTypes.json" );

class Filter {

    constructor( obj ) {
        this.league     = obj.league,
        this.item       = obj.item,
        this.title      = obj.title,
        this.budget     = obj.budget,
        this.currency   = obj.currency,
        this.links      = obj.links,
        this.sockets    = obj.sockets,
        this.id         = obj.id,
        this.corrupted  = obj.corrupted,
        this.crafted    = obj.crafted,
        this.enchanted  = obj.enchanted,
        this.identified = obj.identified,
        this.level      = obj.level,
        this.tier       = obj.tier,
        this.quality    = obj.quality,
        this.rarity     = obj.rarity,
        this.armor      = obj.armor,   
        this.es         = obj.es,      
        this.evasion    = obj.evasion, 
        this.dps        = obj.dps,
        this.affixes    = obj.affixes,
        this.affixesDis = obj.affixesDis,
        this.buyout     = obj.buyout,
        this.clipboard  = obj.clipboard,
        this.itemType   = obj.itemType,
        this.title      = obj.title
    }

    /**
     * Render the filter to html using a template
     *
     * @params Callback
     * @return Generated HTML through callback
     */
    render( callback ) {
        var generated = "";
        mu.compileAndRender( "filter.html", this )
        .on( "data", function ( data ) {
            generated += data.toString();
        })
        .on( "end", function() {
            callback( generated );
        });
    }

    /**
     * Compute item price
     *
     * @params Item, stashName, currencyRates
     * @return Price
     */
    computePrice( item, stashName, currencyRates ) {
        // Default currency is chaos
        var currency = "chaos";
        var originalPrice = "";
        var convertedPrice;
        var convertedPriceChaos;

        // The price is the name of the stash
        var price = stashName;
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
                originalPrice = ( match[2] / match[3] ) + " " + match[4];
                // Same but convert to chaos: 1/2 exa -> 0.5 x chaos_rate(exa)
                convertedPrice = ( match[2] / match[3] ) * currencyRates[this.league][match[4]];
            // Otherwise
        } else {
                // Same thing as above without divisions
                originalPrice  = match[1] + " " + match[4];
                convertedPrice = match[1] * currencyRates[this.league][match[4]];
            }
            
            convertedPriceChaos = convertedPrice;
            // If the converted price is above the rate of exalted orbs in this league
            // convert the price to exalted instead
            if ( convertedPrice > currencyRates[this.league].exa ) {
                convertedPrice /= currencyRates[this.league].exa;
                currency = "exa";
            }
            // Round up the price to .00 precision
            convertedPrice = Math.round( convertedPrice * 100 ) / 100;

            return { convertedPrice:      convertedPrice, 
                     convertedPriceChaos: convertedPriceChaos,
                     originalPrice:       originalPrice,
                     currency:            currency };
            // console.log( "Found entry: " + name + " for " + convertedPrice + " " + currency );
        // If there is no price, this is barter
        } else {
            // console.log( "Invalid price: " + price );
            originalPrice = "Negociate price";
            return { originalPrice: originalPrice };
        }
    }

    /**
     * Update item entry with dps values
     *
     * @params Item, DPS, callback
     * @return Item with DPS values through callback
     */
    insertDPSValues( item, dps, callback ) {
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
     * Compare mods from item and filter
     *
     * @params Item to compare, callback
     * @return Boolean through callback
     */
    compareMods( item, parsedMods, callback ) {
        var passed = 0;
        var keys   = 0;
        // Compare mod values to filter
        for ( var affix in this.affixes ) {
            if ( this.affixes.hasOwnProperty( affix )) {
                keys++;
                // If mod has one parameter
                if ( parsedMods.mods[affix] && parsedMods.mods[affix].length === 1 ) {
                    if ( parsedMods.mods[affix] && this.affixes[affix][0] <= parsedMods.mods[affix][0] &&
                        this.affixes[affix][1] >= parsedMods.mods[affix][0]) {
                        passed++;
                    }
                // If mod has two
                } else if ( parsedMods.mods[affix] && parsedMods.mods[affix].length === 2 ) {
                    var average = ( parsedMods.mods[affix][0] + parsedMods.mods[affix][1]) / 2;
                    if ( parsedMods.mods[affix] &&
                        this.affixes[affix][0] <= average &&
                        this.affixes[affix][1] >= average ) {
                        passed++;
                    }
                // Otherwise
                } else if ( parsedMods.mods[affix]) {
                    passed++;
                }
            }
        }
        callback( passed === keys );
    }

    /**
     * Compare properties from item and filter
     *
     * @params Item to compare, callback
     * @return Boolean through callback
     */
    compareProperties( item, parsedProperties, callback ) {
        var self = this;
        // If:
        // ( no evasion filter OR filter evasion <= item evasion ) AND
        // ... ES ...
        // ... Armor ...
        // ... DPS ...
        // ... Quality ...
        // ( no tier filter OR ( item tier is a map tier AND both tiers are equal ) 
        //  OR ( item tier is a talisman tier AND both tiers are equal )) AND
        // ( item is not a gem OR no level filter OR ( item is a gem AND filter level <= gem level ))
        if (( this.evasion === "" || parseInt( this.evasion ) <= parseInt( parsedProperties["Evasion Rating"])) &&
            ( this.es      === "" || parseInt( this.es )      <= parseInt( parsedProperties["Energy Shield"])) && 
            ( this.armor   === "" || parseInt( this.armor )   <= parseInt( parsedProperties.Armour )) &&
            ( this.dps === "" || parseFloat( this.dps ) <= parseFloat( parsedProperties.DPS )) &&
            ( this.quality   === "" || parsedProperties.Quality !== undefined &&
            parseInt( this.quality ) <= parseInt( parsedProperties.Quality.replace( /[\+\%]/g, "" ))) &&
            ( this.tier   === "" || ( parsedProperties["Map Tier"] !== undefined && (
            parseInt( this.tier ) === parseInt( parsedProperties["Map Tier"]) || 
            parseInt( this.tier ) === item.talismanTier ))) &&
            ( item.frameType !== 4 || this.level  === "" || (
                item.frameType === 4 && parsedProperties.Level !== undefined &&
                parseInt( this.level ) <= parseInt( parsedProperties.Level )))) {
            // Check the amount of links
            Item.getLinksAmountAndColor( item, function( res ) {
                item.linkAmount = res.linkAmount;
                // If there is no link filter or item links >= filter links
                callback( res.linkAmount >= self.links || self.links === "any" );
            });
        } else {
            callback( false );
        }
    }

    /**
     * Format time to display on the interface
     *
     * @params Nothing
     * @return Formatted time
     */
    formatTime() {
        var date = new Date();
        var hour = date.getHours()   < 10 ? "0" + date.getHours()   : date.getHours();
        var min  = date.getMinutes() < 10 ? "0" + date.getMinutes() : date.getMinutes();
        var sec  = date.getSeconds() < 10 ? "0" + date.getSeconds() : date.getSeconds();
        
        return hour + " : " + min + " : " + sec;
    }

    /**
     * Format item to display in the results
     *
     * @params Item, item name, prices, char name and callback
     * @return Formatted item through callback
     */
    formatItem( item, name, prices, characterName, callback ) {
        // console.log( item );
        var time = this.formatTime();
        var guid = Misc.guidGenerator();
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
                prices.currency = "Negociate price";
            }

            if ( item.linkAmount > 4 ) {
                name += " " + item.linkAmount + "L";
            }
            callback({
                time:          time,
                account:       characterName,
                item:          name,
                frameType:     item.frameType,
                price:         prices.convertedPrice,
                currency:      prices.currency,
                originalPrice: prices.originalPrice,
                itemId:        item.id,
                id:            guid,
                icon:          item.icon,
                implicit:      implicit,
                explicit:      explicit,
                crafted:       crafted,
                enchant:       enchant,
                properties:    properties,
                links:         item.linkAmount,
                league:        item.league
            });
        });
    }

    /**
     * Check if item match the filter
     *
     * @params Item to check against, currency rates, character name, callback
     * @return Boolean through callback
     */
    check( item, stashName, characterName, currencyRates, callback ) {
        var self = this;
        // Clean up the item name and typeLine
        var itemName = item.name.replace( "<<set:MS>><<set:M>><<set:S>>", "" );
        var typeLine = item.typeLine.replace( "<<set:MS>><<set:M>><<set:S>>", "" );
        var name = itemName;
        // If item name is empty, the name is the type instead
        if ( itemName === "" ) {
            name = typeLine;
        }

        // If: 
        // ( no names filter OR names are the same OR the typeLines are the same ) AND
        // ( no leagues filter OR leagues are the same ) AND
        // ( no socket amount filter OR socket amounts are the same ) AND
        // ( both are corrupted OR no corrupted state filter ) AND
        // ... enchanted ...
        // ... crafted ...
        // ... identified ...
        // ( no level filter OR item is a gem OR ( item is not a gem AND filter level <= item level )) AND
        // ( no rarity filter OR rarities are the same ) AND
        // ( no item type filter OR item types are the same )
        if (( this.item    === ""    || itemName === this.item || typeLine === this.item ) &&
            ( this.league  === "any" || item.league === this.league ) &&
            ( this.sockets === ""    || this.sockets <= item.sockets.length ) && 
            (( this.corrupted  == 'true' ) === item.corrupted  || this.corrupted  === "any" ) &&
            (( this.enchanted  == 'true' ) === item.enchanted  || this.enchanted  === "any" ) &&
            (( this.crafted    == 'true' ) === item.crafted    || this.crafted    === "any" ) &&
            (( this.identified == 'true' ) === item.identified || this.identified === "any" ) &&
            ( this.level === "" || item.frameType === 4 || ( item.frameType !== 4 && this.level <= item.ilvl )) && 
            ( this.rarity === "any" || this.rarity == item.frameType ) &&
            ( this.itemType === "any" || itemTypes[this.itemType].types.indexOf( item.typeLine ) !== -1 )
            ) {

            var prices = this.computePrice( item, stashName, currencyRates );
            
            // Convert filter price to chaos and check if the item is within budget
            if (( prices.convertedPrice && 
                  prices.convertedPriceChaos <= this.budget * currencyRates[this.league][this.currency]) || 
                ( !prices.convertedPrice && !this.buyout )) {

                // Parse item mods
                Item.parseMods( item, function( parsedMods ) {
                    // Compare mods
                    self.compareMods( item, parsedMods, function( passed ) {
                        if ( passed ) {
                            Item.parseProperties( item, function( newItem, parsedProperties ) {
                                // console.log( newItem );
                                // If we have an attack per second property, compute DPS
                                if ( parsedProperties["Attacks per Second"]) {
                                    var dps = Item.computeDPS( parsedProperties );
                                    parsedProperties.DPS = dps.DPS;
                                    self.insertDPSValues( newItem, dps, function( item ) {
                                        // Compare properties
                                        self.compareProperties( item, parsedProperties, function( equal ) {
                                            // console.log( newItem );
                                            if ( equal ) {
                                                self.formatItem( item, name, prices, characterName, function( newItem ) {
                                                    callback( newItem );
                                                });
                                            // Item does not have the required properties
                                            } else {
                                                callback( false );
                                            }
                                        });
                                    });
                                } else {
                                    // Compare properties
                                    self.compareProperties( newItem, parsedProperties, function( equal ) {
                                        // console.log( newItem );
                                        if ( equal ) {
                                            self.formatItem( newItem, name, prices, characterName, function( newItem ) {
                                                callback( newItem );
                                            });
                                        // Item does not have the required properties
                                        } else {
                                            callback( false );
                                        }
                                    });
                                }
                            });
                        // Item does not have the required mods
                        } else {
                            // console.log( "Item didn't have sufficient mods" );
                            callback( false );
                        }
                    });
                });
            // Item is not within the budget
            } else {
                callback( false );
            }
        // Item does not match the first tests
        } else {
            callback( false );
        }
    }

}

module.exports = Filter;