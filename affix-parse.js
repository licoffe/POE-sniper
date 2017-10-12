var request = require( "request" );
var async   = require( "async" );
var fs      = require( "fs" );

const valueReg = /([0-9.]+)/g;

// var typeLookup = {
//     "prefix"   : 1,
//     "suffix"   : 2,
//     "enchant"  : 10,
//     "corrupted": 5
// };

var buildURL = function( type, domain, filter ) {
    if ( !domain ) {
        return "https://pathofexile.gamepedia.com/Special:Ask/mainlabel%3D/format%3Djson/link%3Dnone/default%3D/template%3DSMW-20mod-20table/userparam%3Dextra-5Frows%3D2,-20effect-5Frowid%3D2,-20show-5Ftags%3Dno/introtemplate%3DSMW-20mod-20table-2Fshared-2Fintro-20without-20weight/outrotemplate%3DSMW-20mod-20table-2Foutro/order%3DASC/sort%3DIs-5Fmod/offset%3D0/limit%3D1000/-5B-5BIs-20mod::" + filter + "-5D-5D-20-5B-5BHas-20mod-20generation-20type::" + type + "-5D-5D-20-5B-5B-5D-5D/-3FHas-20name/-3FHas-20stat-20text/prettyprint%3Dtrue/unescape%3Dtrue/searchlabel%3DJSON";
    } else {
        return "https://pathofexile.gamepedia.com/Special:Ask/mainlabel%3D/format%3Djson/link%3Dnone/default%3D/template%3DSMW-20mod-20table/userparam%3Dextra-5Frows%3D2,-20effect-5Frowid%3D2,-20show-5Ftags%3Dno/introtemplate%3DSMW-20mod-20table-2Fshared-2Fintro-20without-20weight/outrotemplate%3DSMW-20mod-20table-2Foutro/order%3DASC/sort%3DIs-5Fmod/offset%3D0/limit%3D1000/-5B-5BIs-20mod::" + filter + "-5D-5D-20-5B-5BHas-20mod-20generation-20type::" + type + "-5D-5D-20-5B-5BHas-20mod-20domain::" + domain + "-5D-5D/-3FHas-20name/-3FHas-20stat-20text/prettyprint%3Dtrue/unescape%3Dtrue/searchlabel%3DJSON";
    }
};

var urls = {
    "Body-armor" : {
        "prefix":         buildURL( 1, 1, "!~*ssence*" ),
        "suffix":         buildURL( 2, 1, "!~*ssence*" ),
        "crafted-prefix": buildURL( 1, 10, "!~*ssence*" ),
        "crafted-suffix": buildURL( 2, 10, "!~*ssence*" ),
        "essence-prefix": buildURL( 1, 1, "~*ssence*" ),
        "essence-suffix": buildURL( 2, 1, "~*ssence*" ),
        "enchant":        buildURL( 10, null, "!~*ssence*" ),
        "corrupted":      buildURL( 5, 1, "!~*ssence*" ),
        // "unique":         buildURL( 3, 1, "!~*ssence*" )
    },
    "Flask": {
        "prefix":         buildURL( 1, 2, "!~*ssence*" ),
        "suffix":         buildURL( 2, 2, "!~*ssence*" ),
        // "unique":         buildURL( 3, 1, "!~*lask*" )
    },
    "Jewel": {
        "prefix":         buildURL( 1, 11, "!~*ssence*" ),
        "suffix":         buildURL( 2, 11, "!~*ssence*" ),
        "corrupted":      buildURL( 5, 11, "!~*ssence*" ),
        // "unique":         buildURL( 3, 11, "!~*ewel*" )
    },
    "Map": {
        "prefix":         buildURL( 1, 5, "!~*ssence*" ),
        "suffix":         buildURL( 2, 5, "!~*ssence*" ),
        // "unique":         buildURL( 3, 5, "!~*ap*" )
    }
};

var parseContent = function( url, itemType, affixType, callback ) {
    console.log( "Item-type: " + itemType + ", affix-type: " + affixType );
    request({ "url": url, "gzip": true },
    function( error, response, body ) {
        if ( error ) {
            console.log( "Error occured: " + error );
        }
        var parsedJSON = JSON.parse( body );
        async.eachLimit( Object.keys( parsedJSON.results ), 1, function( temp, cbAffix ) {
            var affix = parsedJSON.results[temp];
            // console.log(affix);
            if ( affix.hasOwnProperty( "printouts" ) && affix["printouts"].hasOwnProperty( "Has stat text" )) {
                var rawAffix = affix["printouts"]["Has stat text"][0];
                if ( rawAffix ) {
                    var splitted = rawAffix.split( "<br>" );
                    var min = [];
                    var max = [];
                    var affixName = "";
                    async.each( splitted, function( split, cbSplit ) {
                        affixName = split;
                        if ( splitted.length > 1 ) {
                            affixName += " - multi";
                        }
                        var values = [];
                        var matches  = valueReg.exec( split );
                        while ( matches !== null ) {
                            values.push( matches[1]);
                            matches = valueReg.exec( split );
                        }
                        if ( values.length === 4 ) {
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
                            console.log( "Could not match: " + split );
                        }
                        //console.log(rawaffix);
                        //still needs some work, tried to capture word differences, might be too hard - died to octal warnings anyhow
                        // i.e. freeze/frozen in affix: (20-25)% chance to Avoid being [[Freeze|Frozen]]
                        //rawaffix = rawaffix.replace(new RegExp('\[\[([A-Za-z\s]+)(?=\|)\|\1(.*)\]\]', 'g'), '$1\($2\)');
            
                        // Always favors second phrase (frozen over freeze)
                        affixName = affixName.replace( /\[\[([A-Za-z\s0-9]+)(?=\|)\|([A-Za-z\s0-9]+)\]\]/g, '$2' );
                        affixName = affixName.replace( /\d+/g, '#');
                        affixName = affixName.replace( /[\[\]\(\)]/g, '');
                        affixName = affixName.replace( /#-#/g, '#');
                        if ( !affixes[itemType][affixType][affixName]) {
                            affixes[itemType][affixType][affixName] = [];
                        }
                        affixes[itemType][affixType][affixName].push({
                            "original": affix["printouts"]["Has stat text"][0],
                            "name": affix["printouts"]["Has name"][0],
                            "min": min,
                            "max": max,
                            "lvl": parseFloat( 0 )
                        });
                        cbSplit();
                    }, function() {
                        
                    });
                }
                cbAffix();
            } else {
                console.log( "unhandled error" );
            }
        }, function() {
            callback();
        });
    });
};

var affixes = {};

// For each item type
async.eachLimit( Object.keys( urls ), 1, function( itemType, cbItem ) {
    affixes[itemType] = {};
    // For each affix type
    async.eachLimit( Object.keys( urls[itemType]), 1, function( affixType, cbAffix ) {
        affixes[itemType][affixType] = {};
        parseContent( urls[itemType][affixType], itemType, affixType, function() {
            // Switch affix type when content parsed
            cbAffix();
        });
    }, function() {
        // Switch item type
        cbItem();
    });
}, function() {
    // console.log( JSON.stringify( affixes ));
    fs.writeFileSync( "out.json", JSON.stringify( affixes ));
});