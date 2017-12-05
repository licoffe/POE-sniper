var jsdom = require("jsdom/lib/old-api.js");
var async = require( "async" );
var fs    = require( "fs" );

var baseURL   = "https://pathofexile.gamepedia.com/";
var reqLvlReg = /Req. Lv. (\d+)/;
var valueReg  = /([0-9.]+)/g;
var itemTypes = {
    "One-handed axe": "List_of_one-handed_axe_modifiers",
    "Claw": "List_of_claw_modifiers",
    "Dagger": "List_of_dagger_modifiers",
    "One-handed mace": "List_of_one-handed_mace_modifiers",
    "Sceptre": "List_of_sceptre_modifiers",
    "One-handed sword": "List_of_one-handed_swords_modifiers",
    "Wand": "List_of_wand_modifiers",
    "Two-handed axe": "List_of_two-handed_axe_modifiers",
    "Bow": "List_of_bow_modifiers",
    "Fishing rod": "List_of_fishing_rod_modifiers",
    "Two-handed mace": "List_of_two-handed_mace_modifiers",
    "Staff": "List_of_staff_modifiers",
    "Two-handed sword": "List_of_two-handed_sword_modifiers",
    "Shield": {
        "AR": "List_of_str_shield_modifiers",
        "EV": "List_of_dex_shield_modifiers",
        "ES": "List_of_int_shield_modifiers",
        "AR/EV": "List_of_str_dex_shield_modifiers",
        "AR/ES": "List_of_str_int_shield_modifiers",
        "EV/ES": "List_of_dex_int_shield_modifiers"
    },
    "Helmet": {
        "AR": "List_of_str_helmet_modifiers",
        "EV": "List_of_dex_helmet_modifiers",
        "ES": "List_of_int_helmet_modifiers",
        "AR/EV": "List_of_str_dex_helmet_modifiers",
        "AR/ES": "List_of_str_int_helmet_modifiers",
        "EV/ES": "List_of_dex_int_helmet_modifiers"
    },
    "Boots": {
        "AR": "List_of_str_boot_modifiers",
        "EV": "List_of_dex_boot_modifiers",
        "ES": "List_of_int_boot_modifiers",
        "AR/EV": "List_of_str_dex_boot_modifiers",
        "AR/ES": "List_of_str_int_boot_modifiers",
        "EV/ES": "List_of_dex_int_boot_modifiers"
    },
    "Gloves": {
        "AR": "List_of_str_glove_modifiers",
        "EV": "List_of_dex_glove_modifiers",
        "ES": "List_of_int_glove_modifiers",
        "AR/EV": "List_of_str_dex_glove_modifiers",
        "AR/ES": "List_of_str_int_glove_modifiers",
        "EV/ES": "List_of_dex_int_glove_modifiers"
    },
    "Body-armor": {
        "AR": "List_of_str_body_armour_modifiers",
        "EV": "List_of_dex_body_armour_modifiers",
        "ES": "List_of_int_body_armour_modifiers",
        "AR/EV": "List_of_str_dex_body_armour_modifiers",
        "AR/ES": "List_of_str_int_body_armour_modifiers",
        "EV/ES": "List_of_dex_int_body_armour_modifiers"
    },
    "Amulet": "List_of_amulet_modifiers",
    "Belt": "List_of_belt_modifiers",
    "Quiver": "List_of_quiver_modifiers",
    "Ring": "List_of_ring_modifiers",
    "Flask": {
        "Life": "List_of_life_flask_modifiers",
        "Mana": "List_of_mana_flask_modifiers",
        "Hybrid": "List_of_hybrid_flask_modifiers",
        "Utility": "List_of_utility_flask_modifiers",
        "Critical Utility": "List_of_critical_utility_flask_modifiers",
        "Silver": "List_of_silver_flask_modifiers"
    },
    "Jewel": {
        "Cobalt": "List_of_cobalt_jewel_modifiers",
        "Crimson": "List_of_crimson_jewel_modifiers",
        "Viridian": "List_of_viridian_jewel_modifiers",
        "Prismatic": "List_of_prismatic_jewel_modifiers"
    }
};
itemTypes = {
    "Gloves": {
        "AR": "List_of_str_glove_modifiers",
        "EV": "List_of_dex_glove_modifiers",
        "ES": "List_of_int_glove_modifiers",
        "AR/EV": "List_of_str_dex_glove_modifiers",
        "AR/ES": "List_of_str_int_glove_modifiers",
        "EV/ES": "List_of_dex_int_glove_modifiers"
    },
};
var parsedAffixes = {};

var headlines = ["prefix", "suffix", "corrupted"];

var parseAffixes = function( category, subcategory, window, callback ) {
    var maxValues = {};
    var lastMaxes = [];
    var lastMod = "";
    var $      = window.$;
    var entry  = {};
    var parsed = {};
    $( "div" ).find( ".mw-headline" ).each( function() {
        var type = $( this ).text().toLowerCase();
        if ( headlines.indexOf( type ) !== -1 ) {
            // console.log( type );
            parsed[type] = {};
            $( this ).parent().parent().find( "table th .-mod" ).each( function()  {
                var counter = 0;
                $( this ).parent().parent().parent().find( "td" ).each( function() {
                    var column = $( this ).text().trim();
                    if ( column !== "" ) {
                        var match;
                        switch ( counter ) {
                            case 0:
                                entry.name = column;
                                break;
                            case 1:
                                match = reqLvlReg.exec( column );
                                if ( match && match.length > 1 ) {
                                    entry.lvl = parseInt( match[1]);
                                } else {
                                    console.log( "Could not parse level: " + column );
                                }
                                break;
                            case 2:
                                // Extract affix title
                                var affixTitle = column;
                                affixTitle = affixTitle.replace( valueReg, "#" );
                                affixTitle = affixTitle.replace( /\(|\)/g, "" );
                                affixTitle = affixTitle.replace( /#-#/g, "#" );
                                if ( affixTitle !== lastMod && lastMod !== "" ) {
                                    const splitted = lastMod.split( ", " );
                                    if ( splitted.length > 1 ) {
                                        if ( !maxValues[splitted[0]]) {
                                            maxValues[splitted[0]] = 0;
                                        }
                                        if ( !maxValues[splitted[1]]) {
                                            maxValues[splitted[1]] = 0;
                                        }
                                        maxValues[splitted[0]] += parseFloat( lastMaxes[0]);
                                        maxValues[splitted[1]] += parseFloat( lastMaxes[1]);
                                    } else {
                                        if ( !maxValues[lastMod]) {
                                            maxValues[lastMod] = 0;
                                        }
                                        maxValues[lastMod] += parseFloat( lastMaxes[0]);
                                    }
                                    lastMaxes = [];
                                }
                                lastMod = affixTitle;
                                // Check if the mod is hybrid
                                const splitted = affixTitle.split( ", " );
                                const hybrid   = splitted.length > 1 ? true : false;

                                if ( !parsed[type][affixTitle] ) {
                                    parsed[type][affixTitle] = [];
                                }
                                match  = valueReg.exec( column );
                                var values = [];
                                while ( match !== null ) {
                                    values.push( match[1]);
                                    match = valueReg.exec( column );
                                }
                                var min = [];
                                var max = [];
                                if ( values.length === 4 && !hybrid ) {
                                    min = [parseFloat( values[0]), parseFloat( values[1])];
                                    max = [parseFloat( values[2]), parseFloat( values[3])];
                                } else if ( values.length === 3 ) {
                                    min = [parseFloat( values[0])];
                                    max = [parseFloat( values[1]), parseFloat( values[2])];
                                } else if ( values.length === 2 ) {
                                    min = [parseFloat( values[0])];
                                    max = [parseFloat( values[1])];
                                } else if ( values.length === 1 ) {
                                    min = [parseFloat( values[0])];
                                    max = [parseFloat( values[0])];
                                } else {
                                    // console.log( "Could not match: " + column );
                                }
                                if ( !hybrid ) {
                                    entry.min = min;
                                    entry.max = max;
                                    lastMaxes[0] = entry.max;
                                } else {
                                    entry.hybrid = true;
                                    entry.mods = {};
                                    entry.mods[splitted[0]] = {
                                        "min": [parseFloat( values[0])],
                                        "max": [parseFloat( values[1])]
                                    };
                                    entry.mods[splitted[1]] = {
                                        "min": [parseFloat( values[2])],
                                        "max": [parseFloat( values[3])]
                                    };
                                    lastMaxes = [
                                        entry.mods[splitted[0]].max,
                                        entry.mods[splitted[1]].max
                                    ]
                                }
                                // console.log( lastMod );
                                // console.log( lastMaxes );
                                parsed[type][affixTitle].push( entry );
                                entry     = {};
                                values    = [];
                                counter   = -1;
                                break;
                        }
                        counter++;
                        // console.log( column );
                    }
                });
            });
        }
    });
    parsed.maxValues = maxValues;
    callback( parsed );
};

var processItemCategory = function( category, subcategory, callback ) {
    var url;
    if ( !subcategory ) {
        url = baseURL + itemTypes[category];
    } else {
        url = baseURL + itemTypes[category][subcategory];
    }
    jsdom.env(
        url,
        ["http://code.jquery.com/jquery.js"],
        function ( err, window ) {
            parseAffixes( category, subcategory, window, callback );
        }
    );
};

async.eachLimit( Object.keys( itemTypes ), 1, function( type, cbType ) {
    console.log( "Parsing " + type );
    if ( typeof itemTypes[type] === "object" ) {
        async.eachLimit( Object.keys( itemTypes[type]), 1, function( subtype, cbSubtype ) {
            console.log( "Parsing subtype " + subtype );
            if ( !parsedAffixes[type]) {
                parsedAffixes[type] = {};
            }
            processItemCategory( type, subtype, function( parsed ) {
                parsedAffixes[type][subtype] = parsed;
                cbSubtype();
            });
        }, function() {
            fs.writeFile( "affix-parse/" + type + ".json", JSON.stringify( parsedAffixes[type], null, "\t" ), function() {
                parsedAffixes = {};
                cbType();
            });
        });
    } else {
        processItemCategory( type, null, function( parsed ) {
            fs.writeFile( "affix-parse/" + type + ".json", JSON.stringify( parsed, null, "\t" ), function() {
                cbType();
            });
            // parsedAffixes[type] = parsed;
        });
    }
}, function() {
    fs.writeFile( "out.json", JSON.stringify( parsedAffixes ), function() {
        console.log( "Wrote output to file" );
    });
});