/**
 * Item class
 *
 * Extract mods, properties and socket information from items
 * @params Nothing
 * @return Item object
 */

var async = require( "async" );

class Item {

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
            callback({ "linkAmount": linkAmount, "colors": colors, "linkedColors": linkColors });
        });
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
                    itemProperties[addProperty.name] = addProperty.progress;
                    newItem.properties.push({
                        name: "Experience",
                        values: [[addProperty.progress]]
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
}

module.exports = Item;