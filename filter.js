/**
 * Filter class
 *
 * Filter representation
 * @params Nothing
 * @return Filter object
 */

var async    = require( "async" );
var mu       = require( "mu2" );
var fs       = require( "fs" );
const {app}  = require( "electron" ).remote;
const path   = require( "path" );
mu.root      = __dirname + '/templates';
var config   = {};
// Check if config.json exists in app data, otherwise create it from default
// config file.
if ( !fs.existsSync( app.getPath( "userData" ) + path.sep + "config.json" )) {
    console.log( "Config file does not exist, creating it" );
    var readStream  = fs.createReadStream( __dirname + path.sep + "config.json" );
    var writeStream = fs.createWriteStream( app.getPath( "userData" ) + path.sep + "config.json" );
    writeStream.on( "close", function() {
        config = require( app.getPath( "userData" ) + path.sep + "config.json" );
    });
    readStream.pipe( writeStream );
} else {
    console.log( "Loading config from " + app.getPath( "userData" ) + path.sep + "config.json" );
    config = require( app.getPath( "userData" ) + path.sep + "config.json" );
}
// Item price RegExp
var priceReg = /(?:([0-9\.]+)|([0-9]+)\/([0-9]+)) ([a-z]+)/g;
var Item     = require( "./item.js" );
var Misc     = require( "./misc.js" );
var itemTypes = require( "./itemTypes.json" );

class Filter {

    constructor( obj ) {
        this.league       = obj.league,
        this.item         = obj.item,
        this.title        = obj.title,
        this.budget       = obj.budget,
        this.currency     = obj.currency,
        this.links        = obj.links,
        this.socketsTotal = obj.socketsTotal,
        this.socketsRed   = obj.socketsRed,
        this.socketsGreen = obj.socketsGreen,
        this.socketsBlue  = obj.socketsBlue,
        this.socketsWhite = obj.socketsWhite,
        this.id           = obj.id,
        this.corrupted    = obj.corrupted,
        this.crafted      = obj.crafted,
        this.enchanted    = obj.enchanted,
        this.identified   = obj.identified,
        this.level        = obj.level,
        this.tier         = obj.tier,
        this.experience   = obj.experience,
        this.quality      = obj.quality,
        this.rarity       = obj.rarity,
        this.armor        = obj.armor,   
        this.es           = obj.es,      
        this.evasion      = obj.evasion, 
        this.dps          = obj.dps,
        this.pdps         = obj.pdps,
        this.affixes      = obj.affixes,
        this.affixesDis   = obj.affixesDis,
        this.buyout       = obj.buyout,
        this.clipboard    = obj.clipboard,
        this.itemType     = obj.itemType,
        this.title        = obj.title,
        this.active       = obj.active,
        this.checked      = obj.active ? "checked" : "",
        this.displayPrice = obj.displayPrice
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
     * @params Item, currencyRates
     * @return Price
     */
    computePrice( item, currencyRates ) {
        // Default currency is chaos
        var currency = "chaos";
        var originalPrice = "";
        var convertedPrice;
        var convertedPriceChaos;
        var league = this.league;
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
                // Same but convert to chaos: 1/2 exa -> 0.5 x chaos_rate(exa)
                convertedPrice = ( match[2] / match[3] ) * currencyRates[league][match[4]];
            // Otherwise
        } else {
                // Same thing as above without divisions
                originalPrice  = Math.round( match[1] * 100 ) / 100 + " " + match[4];
                convertedPrice = match[1] * currencyRates[league][match[4]];
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
                // If there is no lower value
                this.affixes[affix][0] = this.affixes[affix][0] !== "" ? this.affixes[affix][0] : 0;
                // If there is no upper value
                this.affixes[affix][1] = this.affixes[affix][1] !== "" ? this.affixes[affix][1] : 1000000;
                // If mod has one parameter
                if ( parsedMods.mods[affix] && parsedMods.mods[affix].length === 1 ) {
                    if ( parsedMods.mods[affix] && 
                        this.affixes[affix][0] <= parsedMods.mods[affix][0] &&
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
            ( this.dps     === "" || parseFloat( this.dps )   <= parseFloat( parsedProperties.DPS )) &&
            ( this.pdps    === "" || parseFloat( this.pdps )  <= parseFloat( parsedProperties.pDPS )) &&
            ( this.quality   === "" || parsedProperties.Quality !== undefined &&
            parseInt( this.quality ) <= parseInt( parsedProperties.Quality.replace( /[\+\%]/g, "" ))) &&
            ( this.tier   === "" || ( parsedProperties["Map Tier"] !== undefined && (
            parseInt( this.tier ) === parseInt( parsedProperties["Map Tier"]) || 
            parseInt( this.tier ) === item.talismanTier ))) &&
            ( this.experience === "" || parseFloat( this.experience ) <= parseFloat( parsedProperties.Experience )) &&
            ( item.frameType !== 4 || this.level  === "" || (
                item.frameType === 4 && parsedProperties.Level !== undefined &&
                parseInt( this.level ) <= parseInt( parsedProperties.Level )))) {
            // Check the amount of links
            Item.getLinksAmountAndColor( item, function( res ) {
                item.linkAmount = res.linkAmount;
                // If there is no link filter or item links >= filter links AND
                callback(
                    ( res.linkAmount >= self.links || self.links === "any" ) && 
                    ( self.socketsRed   === "" || ( res.colorCount.S >= parseInt( self.socketsRed )))   &&
                    ( self.socketsGreen === "" || ( res.colorCount.D >= parseInt( self.socketsGreen ))) &&
                    ( self.socketsBlue  === "" || ( res.colorCount.I >= parseInt( self.socketsBlue )))  &&
                    ( self.socketsWhite === "" || ( res.colorCount.G >= parseInt( self.socketsWhite )))
                );
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
     * @params  Item, item name, prices and callback
     * @returns Formatted item through callback
     */
    formatItem( item, name, prices, callback ) {
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
            if ( config.useBeta ) {
                item.icon = "http://web.poecdn.com/" + item.icon;
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
                icon:          item.icon,
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
     * Check if item match the filter
     *
     * @params Item to check against, currency rates, callback
     * @return Boolean through callback
     */
    check( item, currencyRates, callback ) {
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
        var league = this.league;
        if ( config.useBeta ) {
            league = "beta-" + league;
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
        if (( this.item    === ""    || itemName.toLowerCase() === this.item.toLowerCase() || 
              typeLine.toLowerCase() === this.item.toLowerCase() ) &&
            ( this.league  === "any" || item.league === this.league ) &&
            ( this.socketsTotal === ""    || this.socketsTotal <= item.sockets.length ) && 
            (( this.corrupted  == 'true' ) === item.corrupted  || this.corrupted  === "any" ) &&
            (( this.enchanted  == 'true' ) === item.enchanted  || this.enchanted  === "any" ) &&
            (( this.crafted    == 'true' ) === item.crafted    || this.crafted    === "any" ) &&
            (( this.identified == 'true' ) === item.identified || this.identified === "any" ) &&
            ( this.level === "" || item.frameType === 4 || ( item.frameType !== 4 && this.level <= item.ilvl )) && 
            ( this.rarity === "any" || this.rarity == item.frameType || ( this.rarity === "not-unique" && item.frameType !== 3 )) &&
            ( this.itemType === "any" || itemTypes[this.itemType].types.indexOf( item.typeLine ) !== -1 )
            ) {

            var prices = this.computePrice( item, currencyRates );
            console.log( currencyRates[league] );
            
            // Convert filter price to chaos and check if the item is within budget
            if ( !this.budget || ( prices.convertedPrice && 
                  prices.convertedPriceChaos <= this.budget * currencyRates[league][this.currency]) || 
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
                                    parsedProperties.pDPS = dps.pDPS;
                                    self.insertDPSValues( newItem, dps, function( item ) {
                                        // Compare properties
                                        self.compareProperties( item, parsedProperties, function( equal ) {
                                            if ( equal ) {
                                                self.formatItem( item, name, prices, function( newItem ) {
                                                    callback( newItem );
                                                });
                                            // Item does not have the required properties
                                            } else {
                                                // fs.appendFileSync( __dirname + "/log.txt", name + " (" + typeLine + "): Not the right properties\n" );
                                                callback( false );
                                            }
                                        });
                                    });
                                } else {
                                    // Compare properties
                                    self.compareProperties( newItem, parsedProperties, function( equal ) {
                                        // console.log( newItem );
                                        if ( equal ) {
                                            self.formatItem( newItem, name, prices, function( newItem ) {
                                                callback( newItem );
                                            });
                                        // Item does not have the required properties
                                        } else {
                                            // fs.appendFileSync( __dirname + "/log.txt", name + " (" + typeLine + "): Not the right properties\n" );
                                            callback( false );
                                        }
                                    });
                                }
                            });
                        // Item does not have the required mods
                        } else {
                            // fs.appendFileSync( __dirname + "/log.txt", name + " (" + typeLine + "): Not the right mods\n" );
                            // console.log( "Item didn't have sufficient mods" );
                            callback( false );
                        }
                    });
                });
            // Item is not within the budget
            } else {
                // fs.appendFileSync( __dirname + "/log.txt", name + " (" + typeLine + "): Not within budget\n" );
                callback( false );
            }
        // Item does not match the first tests
        } else {
            // fs.appendFileSync( __dirname + "/log.txt", name + " (" + typeLine + "): Failed first tests\n" );
            callback( false );
        }
    }

}

module.exports = Filter;