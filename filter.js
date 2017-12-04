/* jshint node: true */
/* jshint jquery: true */
/* jshint esversion: 6 */
"use strict";

/**
 * Filter class
 *
 * Filter representation
 * @params Nothing
 * @return Filter object
 */

var async    = require( "async" );
var mu       = require( "mu2" );
mu.root      = __dirname + '/templates';
var fs       = require( "fs" );
const {app}  = require( "electron" ).remote;
const path   = require( "path" );
var config   = {};
// Check if config.json exists in app data, otherwise create it from default
// config file.
console.log( "Loading config from " + app.getPath( "userData" ) + path.sep + "config.json" );
config = require( app.getPath( "userData" ) + path.sep + "config.json" );

var Item      = require( "./item.js" );
var Currency  = require( "./currency.js" );
var Misc      = require( "./misc.js" );
var itemTypes = require( "./itemTypes.json" );

class Filter {

    constructor( obj ) {
        var self          = this;
        var rangeReg      = /([0-9.]+)\s*\-\s*([0-9.]+)/;
        this.league       = obj.league;
        this.item         = obj.item;
        this.title        = obj.title;
        this.budget       = obj.budget;
        this.currency     = obj.currency;
        this.links        = obj.links;
        this.socketsTotal = obj.socketsTotal;
        this.socketsRed   = obj.socketsRed;
        this.socketsGreen = obj.socketsGreen;
        this.socketsBlue  = obj.socketsBlue;
        this.socketsWhite = obj.socketsWhite;
        this.id           = obj.id;
        this.corrupted    = obj.corrupted;
        this.crafted      = obj.crafted;
        this.enchanted    = obj.enchanted;
        this.identified   = obj.identified;
        this.level        = obj.level;
        this.levelMin     = obj.levelMin;
        this.levelMax     = obj.levelMax;
        this.tier         = obj.tier;
        this.tierMin      = obj.tierMin;
        this.tierMax      = obj.tierMax;
        this.experience   = obj.experience;
        this.experienceMin= obj.experienceMin;
        this.experienceMax= obj.experienceMax;
        this.quality      = obj.quality;
        this.qualityMin   = obj.qualityMin;
        this.qualityMax   = obj.qualityMax;
        this.rarity       = obj.rarity;
        this.armor        = obj.armor;
        this.armorMin     = obj.armorMin;
        this.armorMax     = obj.armorMax;
        this.es           = obj.es;
        this.esMin        = obj.esMin;
        this.esMax        = obj.esMax;
        this.evasion      = obj.evasion;
        this.evasionMin   = obj.evasionMin;
        this.evasionMax   = obj.evasionMax;
        this.dps          = obj.dps;
        this.dpsMin       = obj.dpsMin;
        this.dpsMax       = obj.dpsMax;
        this.pdps         = obj.pdps;
        this.pdpsMin      = obj.pdpsMin;
        this.pdpsMax      = obj.pdpsMax;
        this.edps         = obj.edps;
        this.edpsMin      = obj.edpsMin;
        this.edpsMax      = obj.edpsMax;
        this.buyout       = obj.buyout;
        this.clipboard    = obj.clipboard;
        this.itemType     = obj.itemType;
        this.title        = obj.title;
        this.active       = obj.active;
        this.checked      = obj.active ? "checked" : "";
        this.convert      = obj.convert;
        this.displayPrice = obj.displayPrice === undefined ? "" : obj.displayPrice;
        this.openPrefixes = obj.openPrefixes === undefined ? "" : obj.openPrefixes;
        this.openPrefixesMin = obj.openPrefixesMin;
        this.openPrefixesMax = obj.openPrefixesMax;
        this.openSuffixes    = obj.openSuffixes === undefined ? "" : obj.openSuffixes;
        this.openSuffixesMin = obj.openSuffixesMin;
        this.openSuffixesMax = obj.openSuffixesMax;
        this.mapQuantity     = obj.mapQuantity === undefined ? "" : obj.mapQuantity;
        this.mapQuantityMin  = obj.mapQuantityMin;
        this.mapQuantityMax  = obj.mapQuantityMax;
        this.mapRarity       = obj.mapRarity === undefined ? "" : obj.mapRarity;
        this.mapRarityMin    = obj.mapRarityMin;
        this.mapRarityMax    = obj.mapRarityMax;
        this.mapPackSize     = obj.mapPackSize === undefined ? "" : obj.mapPackSize;
        this.mapPackSizeMin  = obj.mapPackSizeMin;
        this.mapPackSizeMax  = obj.mapPackSizeMax;
        this.group           = obj.group;
        this.affixes         = obj.affixes;
        if ( obj.modGroups ) {
            this.modGroups = obj.modGroups;
        } else {
            this.modGroups = {};
        }
        // Convert affixes without type to explicit to ensure compatibility
        // with older versions
        var extractReg = /^\(([a-zA-Z ]+)\)\s*/;
        if ( obj.affixes && Object.keys( this.modGroups ).length === 0 ) {
            self.modGroups.and = {
                "type": "AND",
                "mods": {},
                "id":   Misc.guidGenerator()
            };
            async.each( Object.keys( obj.affixes ), function( affix, cbAffix ) {
                var match = extractReg.exec( affix );
                var newAffix;
                // If mod doesn't start by (Explicit) or (Implicit), etc.
                if ( !match ) {
                    newAffix = "(Explicit) " + affix;
                // Otherwise
                } else {
                    newAffix = affix;
                }
                self.modGroups.and.mods[newAffix] = {};
                if ( !Array.isArray( obj.affixes[affix])) {
                    if ( obj.affixes[affix].min ) {
                        obj.affixes[affix].min = obj.affixes[affix].min.replace( /\<span.*\>(.*)\<\/span.*\>/, "$1" );
                    }
                    if ( obj.affixes[affix].max ) {
                        obj.affixes[affix].max = obj.affixes[affix].max.replace( /\<span.*\>(.*)\<\/span.*\>/, "$1" );
                    }
                    
                    if ( obj.affixes[affix].min === 0 || obj.affixes[affix].min === "" ) {
                        self.modGroups.and.mods[newAffix].min = "…";
                    } else {
                        self.modGroups.and.mods[newAffix].min = obj.affixes[affix].min;
                    }
                    if ( obj.affixes[affix].max === 1000000 || obj.affixes[affix].max === "" ) {
                        self.modGroups.and.mods[newAffix].max = "…";
                    } else {
                        self.modGroups.and.mods[newAffix].max = obj.affixes[affix].max;
                    }
                    cbAffix();
                } else {
                    if ( typeof obj.affixes[affix][0] === "string" && obj.affixes[affix].length > 1 ) {
                        obj.affixes[affix][0] = obj.affixes[affix][0].replace( /\<span.*\>(.*)\<\/span.*\>/, "$1" );
                    }
                    if ( typeof obj.affixes[affix][1] === "string" && obj.affixes[affix].length > 2 ) {
                        obj.affixes[affix][1] = obj.affixes[affix][1].replace( /\<span.*\>(.*)\<\/span.*\>/, "$1" );
                    }
                    if ( obj.affixes[affix][0] === 0 || obj.affixes[affix][0] === "" ) {
                        self.modGroups.and.mods[newAffix].min = "…";
                    } else {
                        self.modGroups.and.mods[newAffix].min = obj.affixes[affix][0];
                    }
                    if ( obj.affixes[affix][1] === 1000000 || obj.affixes[affix][1] === "" ) {
                        self.modGroups.and.mods[newAffix].max = "…";
                    } else {
                        self.modGroups.and.mods[newAffix].max = obj.affixes[affix][1];
                    }
                    cbAffix();
                }
            }, function() {
                console.log( self );
            });
        }
        // Check if we can find an icon for this filter
        var data = require( "./autocomplete.json" );
        async.each( data, function( item, cbItem ) {
            if (( obj.item !== "" && item.name === obj.item ) || item.typeLine === obj.item || item.typeLine === obj.itemType ) {
                self.icon = item.icon;
            }
            cbItem();
        });
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

    compareValues( affix, parsedMod, callback ) {
        if ( isNaN( affix.min )) {
            affix.min = affix.min.replace( /.*>(.+)<.*/, "$1" );
        }
        if ( isNaN( affix.max )) {
            affix.max = affix.max.replace( /.*>(.+)<.*/, "$1" );
        }
        // If there is no lower value
        var affixMin = affix.min !== "…" ? affix.min : 0;
        // If there is no upper value
        var affixMax = affix.max !== "…" ? affix.max : 1000000;
        // console.log( affix );
        // console.log( parsedMod );

        // If mod has one parameter
        if ( parsedMod.length === 1 ) {
            callback( affixMin <= parsedMod[0] && affixMax >= parsedMod[0] );
        // If mod has two
        } else if ( parsedMod.length === 2 ) {
            var average = ( parsedMod[0] + parsedMod[1] ) / 2;
            callback( affixMin <= average && affixMax >= average );
        // Otherwise
        } else {
            callback( true );
        }
    }

    /**
     * Compare mods from item and filter
     *
     * @params Item to compare, callback
     * @return Boolean through callback
     */
    compareMods( parsedMods, callback ) {
        var self     = this;
        var passed   = -1;
        var count    = {};
        var sum      = {};
        var weight   = {};
        var lastType = "";

        // console.log( parsedMods );

        async.eachLimit( self.modGroups, 1, function( group, cbGroup ) {
            // console.log( "-------------------" );
            // console.log( group.type );
            async.eachLimit( Object.keys( group.mods ), 1, function( mod, cbMod ) {
                if ( !passed ) {
                    // console.log( "Skipped" );
                    cbMod();
                } else {
                    // console.log( mod );
                    // AND
                    if ( group.type === "AND" ) {
                        lastType = "and";
                        // If the object has the same mod
                        if ( parsedMods.mods[mod]) {
                            self.compareValues( group.mods[mod], parsedMods.mods[mod], function( res ) {
                                // If values are not in range, fail the test
                                if ( !res ) {
                                    passed = 0;
                                    // console.log( "[AND]: Mod present but values not in range: " + group.mods[mod].min + " - " + group.mods[mod].max );
                                } else {
                                    // console.log( "[AND]: passed" );
                                }
                            });
                        // Otherwise fail the test
                        } else {
                            // console.log( "[AND]: Item is missing " + mod );
                            // console.log( parsedMods );
                            passed = 0;
                        }
                        cbMod();
                    // NOT: If the mod is present, fail the test
                    } else if ( group.type === "NOT" ) {
                        lastType = "not";
                        if ( parsedMods.mods[mod]) {
                            self.compareValues( group.mods[mod], parsedMods.mods[mod], function( res ) {
                                // If values are in range, fail the test
                                if ( res ) {
                                    passed = 0;
                                    // console.log( "[NOT]: Item has NOT mod" );
                                }
                            });
                        }
                        cbMod();
                    // IF: If the mod is present, it should be within interval
                    } else if ( group.type === "IF" ) {
                        lastType = "if";
                        if ( parsedMods.mods[mod]) {
                            self.compareValues( group.mods[mod], parsedMods.mods[mod], function( res ) {
                                if ( !res ) {
                                    passed = 0;
                                    // console.log( "[IF]: Mod present but values not in range: " + group.mods[mod].min + " - " + group.mods[mod].max );
                                }
                                cbMod();
                            });
                        } else {
                            cbMod();
                        }
                    // SUM: If the mod is present, sum its value
                    } else if ( group.type === "SUM" ) {
                        lastType = "sum";
                        if ( parsedMods.mods[mod]) {
                            self.compareValues( group.mods[mod], parsedMods.mods[mod], function( res ) {
                                if ( res ) {
                                    if ( !sum.val ) {
                                        sum.val = 0;
                                        sum.min = group.min;
                                        sum.max = group.max;
                                    }
                                    if ( parsedMods.mods[mod].length === 2 ) {
                                        sum.val += ( parsedMods.mods[mod].min + parsedMods.mods[mod].max ) / 2;
                                    } else if ( parsedMods.mods[mod].length === 1 ) {
                                        sum.val += parsedMods.mods[mod].min;
                                    }
                                }
                                cbMod();
                            });
                        } else {
                            cbMod();
                        }
                    // COUNT: If the mod is present, count 1
                    } else if ( group.type === "COUNT" ) {
                        lastType = "count";
                        if ( parsedMods.mods[mod]) {
                            self.compareValues( group.mods[mod], parsedMods.mods[mod], function( res ) {
                                if ( res ) {
                                    if ( !count.val ) {
                                        count.val = 0;
                                        count.min = group.min;
                                        count.max = group.max;
                                    }
                                    count.val++;
                                }
                                // console.log( parsedMods );
                                cbMod();
                            });
                        } else {
                            // console.log( parsedMods );
                            cbMod();
                        }
                    // WEIGHT: If present, return weighted score
                    } else if ( group.type === "WEIGHT" ) {
                        lastType = "weight";
                        if ( parsedMods.mods[mod]) {
                            self.compareValues( group.mods[mod], parsedMods.mods[mod], function( res ) {
                                if ( res ) {
                                    if ( !weight.val ) {
                                        weight.val = 0;
                                        weight.min = group.min;
                                        weight.max = group.max;
                                    }
                                    if ( parsedMods.mods[mod].length === 2 ) {
                                        weight.val += ( parsedMods.mods[mod].min + parsedMods.mods[mod].max ) / 2 * self.modGroups[group].mods[mod].weight;
                                    } else if ( parsedMods.mods[mod].length === 1 ) {
                                        weight.val += parsedMods.mods[mod].min * group.mods[mod].weight;
                                    } else {
                                        weight.val += group.mods[mod].weight;
                                    }
                                }
                                cbMod();
                            });
                        } else {
                            cbMod();
                        }
                    // Anything else
                    } else {
                        console.log( "Unknown group type: " + group.type );
                        cbMod();
                    }
                }
            }, function() {
                // console.log( lastType );
                // console.log( "weight:" +  weight.val + ", sum: " + sum.val + ", count: " + count.val );
                // If we're switching from weight to another type
                if ( lastType === "weight" ) {
                    // Check if weight is in range, if not fail the test
                    if ( weight.val < weight.min || weight.val > weight.max || !weight ) {
                        passed = 0;
                        // console.log( "[WEIGHT]: " + weight.val + " not in range " + weight.min + " - " + weight.max );
                    }
                    // Reset weight
                    weight = {};
                }
                // If we're switching from sum to another type
                if ( lastType === "sum" ) {
                    // Check if sum is in range, if not fail the test
                    if ( sum.val < sum.min || sum.val > sum.max || !sum ) {
                        passed = 0;
                        // console.log( "[SUM]: " + sum.val + " not in range " + sum.min + " - " + sum.max );
                    }
                    // Reset sum
                    sum = {};
                }
                // If we're switching from count to another type
                if ( lastType === "count" ) {
                    // Check if count is in range, if not fail the test
                    if (( count.min && count.val < count.min ) || ( count.max && count.val > count.max ) || !count.val ) {
                        passed = 0;
                        // console.log( "[COUNT]: " + count.val + " not in range " + count.min + " - " + count.max );
                    } else {
                        // console.log( "Passed count: " + count.val + " in " + count.min + " - " + count.max );
                    }
                    // Reset count
                    count = {};
                }
                cbGroup();
            });
        }, function() {
            callback( passed !== 0 );
        });
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
        if (( this.evasion === "" || ( 
                this.evasionMin <= parseInt( parsedProperties["Evasion Rating"]) && 
                this.evasionMax >= parseInt( parsedProperties["Evasion Rating"]))
            ) &&
            ( this.es === "" || ( 
                this.esMin <= parseInt( parsedProperties["Energy Shield"]) && 
                this.esMax >= parseInt( parsedProperties["Energy Shield"]))
            ) && 
            ( this.armor === "" || ( 
                this.armorMin <= parseInt( parsedProperties.Armour ) && 
                this.armorMax >= parseInt( parsedProperties.Armour ))
            ) &&
            ( this.dps === "" || ( 
                this.dpsMin <= parseFloat( parsedProperties.DPS ) &&
                this.dpsMax >= parseFloat( parsedProperties.DPS ))
            ) &&
            ( this.pdps === "" || ( 
                this.pdpsMin <= parseFloat( parsedProperties.pDPS ) &&
                this.pdpsMax >= parseFloat( parsedProperties.pDPS ))
            ) &&
            ( this.edps === "" || ( 
                this.edpsMin <= parseFloat( parsedProperties.eDPS ) && 
                this.edpsMax >= parseFloat( parsedProperties.eDPS ))
            ) &&
            ( this.mapPackSize === "" || ( 
                this.mapPackSizeMin <= parseFloat( parsedProperties["Monster Pack Size"]) &&
                this.mapPackSizeMax >= parseFloat( parsedProperties["Monster Pack Size"]))
            ) &&
            ( this.mapQuantity === "" || ( 
                this.mapQuantityMin <= parseFloat( parsedProperties["Item Quantity"]) &&
                this.mapQuantityMax >= parseFloat( parsedProperties["Item Quantity"]))
            ) &&
            ( this.mapRarity === "" || ( 
                this.mapRarityMin <= parseFloat( parsedProperties["Item Rarity"]) &&
                this.mapRarityMax <= parseFloat( parsedProperties["Item Rarity"]))
            ) &&
            ( this.quality === "" || (
                parsedProperties.Quality !== undefined &&
                this.qualityMin <= parseInt( parsedProperties.Quality.replace( /[\+\%]/g, "" )) &&
                this.qualityMax >= parseInt( parsedProperties.Quality.replace( /[\+\%]/g, "" )))
            ) &&
            ( this.tier === "" || ( 
                parsedProperties["Map Tier"] !== undefined && (
                    (
                        this.tierMin <= parseInt( parsedProperties["Map Tier"]) &&
                        this.tierMax >= parseInt( parsedProperties["Map Tier"])
                    ) ||
                    (
                        this.tierMin <= parseInt( item.talismanTier ) &&
                        this.tierMax >= parseInt( item.talismanTier )
                    )
                 ))
            ) &&
            ( this.experience === "" || (
                this.experienceMin <= parseFloat( parsedProperties.Experience ) &&
                this.experienceMax >= parseFloat( parsedProperties.Experience ))
            ) &&
            ( item.frameType !== 4 || this.level  === "" || (
                item.frameType === 4 && parsedProperties.Level !== undefined && (
                    this.levelMin <= parseInt( parsedProperties.Level ) &&
                    this.levelMax >= parseInt( parsedProperties.Level )
                )
            ))) {
            // Check the amount of links
            Item.getLinksAmountAndColor( item, function( res ) {
                item.linkAmount = res.linkAmount;
                // If there is no link filter or item links >= filter links
                // console.log( "filter-links: " + self.links + ", item-links: " + res.linkAmount );
                callback(
                    (( self.links === "0" && res.linkAmount < 5 ) || ( self.links !== "0" && self.links !== "45" && res.linkAmount === parseInt( self.links )) || self.links === "any" || ( self.links === "45" && res.linkAmount < 6 )) && 
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
     * Check if item match the filter
     *
     * @params Item to check against, currency rates, callback
     * @return Boolean through callback
     */
    check( item, currencyRates, callback ) {
        var self = this;
        if ( this.currency === "chaos" ) {
            this.currency = "Chaos Orb";
        } else if  ( this.currency === "exa" ) {
            this.currency = "Exalted Orb";
        }
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
        var itemLC = this.item.toLowerCase();

        // GGG no longer displays corrupted field if the item is not corrupted
        if ( !item.corrupted ) {
            item.corrupted = false;
        }

        // If: 
        // ( no names filter OR names are the same OR the typeLines are the same ) AND
        // ( no leagues filter OR leagues are the same ) AND
        // ( no socket amount filter OR socket amounts are the same ) AND
        // ( both are corrupted OR no corrupted state filter ) AND
        // ... identified ...
        // ( no level filter OR item is a gem OR ( item is not a gem AND filter level <= item level )) AND
        // ( no rarity filter OR rarities are the same ) AND
        // ( no item type filter OR item types are the same )
        if (( this.league  === "any" || item.league === this.league ) &&
            ( 
                this.item    === ""    || 
                itemName.toLowerCase() === itemLC || 
                typeLine.toLowerCase() === itemLC 
            ) &&
            ( 
                this.itemType === "any" || 
                this.itemType === "" || 
                itemTypes[this.itemType].types.indexOf( item.typeLine ) !== -1 
            ) &&
            ( 
                this.socketsTotal === "" ||
                this.socketsTotal <= item.sockets.length 
            ) && 
            ( 
                this.corrupted   === "any" || 
                ( this.corrupted  == 'true' ) === item.corrupted ) &&
            ( 
                this.identified  === "any" || 
                ( this.identified == 'true' ) === item.identified ) &&
            ( 
                this.level === "" || 
                item.frameType === 4 || (
                    item.frameType !== 4 && 
                    this.levelMin <= item.ilvl && 
                    this.levelMax >= item.ilvl 
                )
            ) && 
            ( 
                this.rarity === "any" || 
                this.rarity == item.frameType || ( 
                    this.rarity === "not-unique" && 
                    item.frameType !== 3 && 
                    item.frameType !== 9 
                ) || (
                    this.rarity === "shaper" &&
                    item.frameType === 2 &&
                    item.shaper
                ) || (
                    this.rarity === "elder" &&
                    item.frameType === 2 &&
                    item.elder
                ))
            ) {

            var prices = Item.computePrice( item, currencyRates );
            
            // Convert filter price to chaos and check if the item is within budget
            if ( 
                !this.budget || 
                prices.originalAmount > 0 && 
                (( 
                    this.convert && prices.convertedPrice && 
                    prices.convertedPriceChaos <= this.budget * currencyRates[league][this.currency]
                ) || ( !prices.convertedPrice && !this.buyout ) || 
                ( 
                    !this.convert && 
                    this.currency === Currency.shortToLongLookupTable[prices.originalCurrency] && 
                    prices.originalAmount <= this.budget 
                ))) {

                // Parse item mods
                Item.parseMods( item, function( parsedMods ) {
                    // If both filter and item are enchanted OR no enchanted state filter
                    // ... crafted ...
                    if (( self.enchanted === "any" || ( self.enchanted  == 'true' ) === parsedMods.enchanted ) &&
                        ( self.crafted   === "any" || ( self.crafted    == 'true' ) === parsedMods.crafted   )) {
                        var keptTotalMods = [];
                        for ( var mod in parsedMods.totalMods ) {
                            if ( parsedMods.totalMods.hasOwnProperty( mod )) {
                                if ( self.affixes[mod]) {
                                    keptTotalMods.push( mod.replace( /^\([a-zA-Z ]+\)\s*/, "" ).replace( "#", parsedMods.totalMods[mod]));
                                }
                            }
                        }
                        item.totalMods = keptTotalMods;
                        var keptPseudoMods = [];
                        for ( var mod in parsedMods.pseudoMods ) {
                            if ( parsedMods.pseudoMods.hasOwnProperty( mod )) {
                                if ( self.affixes[mod]) {
                                    keptPseudoMods.push( mod.replace( /^\([a-zA-Z ]+\)\s*/, "" ).replace( "#", parsedMods.pseudoMods[mod]));
                                }
                            }
                        }
                        item.pseudoMods = keptPseudoMods;
                        // Compare mods
                        self.compareMods( parsedMods, function( passed ) {
                            if ( passed ) {
                                Item.parseProperties( item, function( newItem, parsedProperties ) {
                                    // If we have an attack per second property, compute DPS
                                    if ( parsedProperties["Attacks per Second"]) {
                                        Item.computeDPS( parsedProperties, function( dps ) {
                                            parsedProperties.DPS  = dps.DPS;
                                            parsedProperties.pDPS = dps.pDPS;
                                            parsedProperties.eDPS = dps.eDPS;
                                            Item.insertDPSValues( newItem, dps, function( item ) {
                                                // Compare properties
                                                self.compareProperties( item, parsedProperties, function( equal ) {
                                                    if ( equal ) {
                                                        Item.formatItem( item, name, prices, self.openPrefixes, self.openSuffixes, function( newItem ) {
                                                            if ( newItem.passed ) {
                                                                callback( newItem );
                                                            } else {
                                                                callback( false );
                                                            }
                                                        });
                                                    // Item does not have the required properties
                                                    } else {
                                                        callback( false );
                                                    }
                                                });
                                            });
                                        });
                                    } else {
                                        // Compare properties
                                        self.compareProperties( newItem, parsedProperties, function( equal ) {
                                            if ( equal ) {
                                                Item.formatItem( newItem, name, prices, self.openPrefixes, self.openSuffixes, function( newItem ) {
                                                    if ( newItem.passed ) {
                                                        callback( newItem );
                                                    } else {
                                                        callback( false );
                                                    }
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
                                callback( false );
                            }
                        });
                    } else {
                        callback( false );
                    }
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