/* jshint node: true */
/* jshint jquery: true */
/* jshint esversion: 6 */
/* jshint browser: true */
"use strict";

// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// All of the Node.js APIs are available in this process.

// Requirements
var fs               = require( "fs" );
var async            = require( "async" );
var marked           = require( "marked" );
var open             = require( "open" );
const {app}          = require( "electron" ).remote;
const path           = require( "path" );

var config = require( app.getPath( "userData" ) + path.sep + "config.json" );
if ( Object.keys( config ).length === 0 ) {
    console.log( "Fallback" );
    config = require( __dirname + "/config.json" );
}

var itemTypes        = require( "./itemTypes.json" );
var Item             = require( "./item.js" );
var Misc             = require( "./misc.js" );
var Filter           = require( "./filter.js" );
var Filters          = require( "./filters.js" );
var Group            = require( "./filter-group.js" );
var FilterGroups     = require( "./filter-groups.js" );
var Currency         = require( "./currency.js" );
var Chunk            = require( "./chunk.js" );
var BlackList        = require( "./blacklist.js" );

// Current leagues
var leagues         = config.leagues;
var groups          = new FilterGroups([]);
var filters         = new Filters([]);

var mu              = require( 'mu2' );
mu.root             = __dirname + '/templates';
const notifier      = require('node-notifier');
notifier.on( "timeout", function () {
    // displayingNotification = false;
});

notifier.on( "click", function () {
    // displayingNotification = false;
    Misc.formatMessage( lastItem, function( str ) {
        ncp.copy( str, function() {
            if ( config.visualNotification ) {
                notifier.notify({
                    'title': 'Message copied to clipboard',
                    'message': str,
                });
            }
        });
    });
});

var ncp             = require( "copy-paste" );
var editingFilter   = "";    // Are we editing filters at the moment
var editingGroup    = "";    // Are we editing a group at the moment
var downloading     = false; // Is the tool downloading chunks at the moment
var results         = {};
var resultsId       = {};
var entryLookup     = {};
var itemInStash     = {};
// Price regexp
var priceReg        = /(?:([0-9\.]+)|([0-9]+)\/([0-9]+)) ([a-z]+)/g;
var currencyRates   = {};
var itemRates       = {};
var delayQueue      = []; // Stores filtered items
var displayingNotification = false;
var lastItem        = null;
var prices          = {};
var loadedAffix     = false;
var editingAffix    = "";
var interrupt       = false;
var sold = 0;
var audio           = new Audio( __dirname + '/' + config.sound );
var itemBlackList;
var playerBlackList;
var modGroups       = {};
var modGroupsId     = {};
// Elements to enable/disable when group editing
var elementList = {
    "fields": [
        "#item", "#item-type", "#armor", "#es", "#evasion", "#affixes",
        "#affix-min", "#affix-max", "#sockets-total", "#sockets-red",
        "#sockets-green", "#sockets-blue", "#sockets-white", "#level", "#quality",
        "#experience", "#tier", "#open-prefixes", "#open-suffixes", "#map-quantity",
        "#map-rarity", "#map-pack-size", "#dps", "#pdps", "#edps"
    ],
    "selects": [
        "#links", "#corrupted", "#crafted", "#enchanted",
        "#identified", "#rarity"
    ]
};

// var writeFilterStats = function( filterStats ) {
//     fs.appendFile( __dirname + "/stats_filters.csv", filterStats, function( err ) {
//         if ( err ) {
//             return console.log( err );
//         }
//         console.log( "The file was saved!" );
//     });
// };

$( document).ready( function() {

    // From https://stackoverflow.com/questions/40544394/stoppropagation-in-scroll-method-wont-stop-outer-div-from-scrolling
    // Prevent parent scrolling while scrolling child
    $.fn.dontScrollParent = function()
    {
        this.bind('mousewheel DOMMouseScroll',function(e)
        {
            var delta = e.originalEvent.wheelDelta || -e.originalEvent.detail;
    
            if (delta > 0 && $(this).scrollTop() <= 0)
                return false;
            if (delta < 0 && $(this).scrollTop() >= this.scrollHeight - $(this).height())
                return false;
    
            return true;
        });
    }

    $( "#conditions" ).dontScrollParent();

    // Interface - actions binding
    // ------------------------------------------------------------------------
    // Cancel editing when 'Cancel filter' is clicked
    $( "#cancel-filter" ).click( function() {
        cancelEditAction();
    });

    // When clicking on 'Add group', add group
    $( "#add-group" ).click( function() {
        addGroupAction();
    });

    // When clicking on 'Add filter', add filter
    $( "#add-filter" ).click( function() {
        addFilterAction();
    });

    // When typing in the filter filter input text field
    $( "#filter-filter" ).keyup( function() {
        filterFilterListAction();
    });

    // When typing in the item filter input text field
    $( "#item-filter" ).keyup( function() {
        filterResultListAction();
    });

    // Fold/unfold filter list when clicking on the arrow
    $( "#fold-filters" ).click( function() {
        foldFilters();
    });

    // Actions
    // ------------------------------------------------------------------------

    // Fold/unfold filter list action
    var foldFilters = function() {
        $( "#fold-filters" ).toggleClass( "folded" );
        // If filter was unfolded
        if ( $( "#fold-filters" ).hasClass( "folded" )) {
            // Fold content
            $( "#filters" ).slideUp();
            // Disable filtering
            $( "#filter-filter" ).prop( "disabled", true );
        // Otherwise
        } else {
            // Unfold content
            $( "#filters" ).slideDown();
            // Enable filtering
            $( "#filter-filter" ).prop( "disabled", false );
        }
    };

    // View setup when dismissing a new update
    var dismissUpdate = function() {
        // Unblur everything
        $( ".filter-form" ).removeClass( "blurred" );
        $( ".filter-interaction" ).removeClass( "blurred" );
        $( ".filter-list" ).removeClass( "blurred" );
        $( ".filter-results" ).removeClass( "blurred" );
        $( ".progress" ).removeClass( "blurred" );
        $( ".cover" ).fadeOut();
        $( ".new-update" ).fadeOut( "fast" );
    };

    // Action when the download button is pressed
    var downloadUpdate = function( version ) {
        open( "https://github.com/licoffe/POE-sniper/releases/" + version );
    };

    // Animate scroll to the top of the page
    var scrollToTopAction = function() {
        // scroll body to 0px on click
        $('body,html').animate({
            scrollTop: 0
        }, config.SCROLL_BACK_TOP_SPEED );
        return false;
    };

    // Action when the user is typing in the filter items text field
    var filterResultListAction = function() {
        // TODO: See if OK performance wise
        $( ".results .collection-item" ).show();
        var text = $( "#item-filter" ).val().toLowerCase();
        $( ".results .collection-item" ).each( function() {
            if ( text !== "" ) {
                var itemName   = $( this ).find( ".item" ).text();
                var leagueName = $( this ).find( ".item-league" ).text();
                var typeLine = $( this ).find( ".item-typeLine" ).text();
                // If the item name nor league match the text typed, hide the item
                if ( itemName.toLowerCase().indexOf( text )   === -1 && 
                     leagueName.toLowerCase().indexOf( text ) === -1 &&
                     typeLine.toLowerCase().indexOf( text )   === -1 ) {
                    $( this ).hide();
                }
            }
        });
        $( "#results-amount" ).text( $( ".entry:visible" ).length );
    };

    // Action when the user is typing in the filter filters text field
    var filterFilterListAction = function() {
        var text = $( "#filter-filter" ).val().toLowerCase();
        $( "#filters .collection-item" ).each( function() {
            if ( text === "" ) {
                $( this ).show();
            } else {
                var itemName = $( this ).find( ".item" ).text();
                if ( itemName.toLowerCase().indexOf( text ) === -1 ) {
                    $( this ).hide();
                }
            }
        });
        // Update filter amount
        updateFilterAmount();
    };

    var resetFilters = function() {
        $( "#item" ).val( "" );
        $( "#price" ).val( "" );
        $( "#currency" ).val( "chaos" );
        $( "#currency").material_select();
        $( "#links" ).val( "any" );
        $( "#links").material_select();
        $( "#sockets-total" ).val( "" );
        $( "#sockets-red" ).val( "" );
        $( "#sockets-green" ).val( "" );
        $( "#sockets-blue" ).val( "" );
        $( "#sockets-white" ).val( "" );
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
        $( "#experience" ).val( "" );
        $( "#quality" ).val( "" );
        $( "#rarity" ).val( "any" );
        $( "#rarity").material_select();
        $( "#armor" ).val( "" );
        $( "#es" ).val( "" );
        $( "#evasion" ).val( "" );
        $( "#dps" ).val( "" );
        $( "#pdps" ).val( "" );
        $( "#edps" ).val( "" );
        $( "#price-bo" ).prop( "checked", true );
        $( "#clipboard" ).prop( "checked", false );
        $( "#convert-currency" ).prop( "checked", true );
        // $( "#affixes-list" ).empty();
        $( "#conditions" ).empty();
        modGroups   = {};
        modGroupsId = {};
        $( "#affix-weight" ).val( "" );
        $( "#mod-group-min" ).val( "" );
        $( "#mod-group-max" ).val( "" );
        $( "#condition-selector" ).val( "and" );
        $( "#condition-selector" ).material_select();
        $( "#item-type" ).val( "" );
        $( "#affix-min" ).val( "" );
        $( "#affix-max" ).val( "" );
        $( "#affixes" ).val( "" );
        $( "#open-prefixes" ).val( "" );
        $( "#open-suffixes" ).val( "" );
        $( "#map-quantity" ).val( "" );
        $( "#map-rarity" ).val( "" );
        $( "#map-pack-size" ).val( "" );
        Materialize.updateTextFields();
        loadedAffix  = false;
        editingAffix = "";
        $( "#add-affix" ).addClass( "disabled" );
        $( "#cancel-affix" ).addClass( "disabled" );
        $( "#add-affix" ).text( "Add" );
        $( "#affixes" ).prop( "disabled", false );
    };

    // When selecting mod group type, toggle input fields
    $( "#condition-selector" ).change( function() {
        var val = $( this ).val();
        // Empty group min/max fields
        $( "#mod-group-min" ).val( "" );
        $( "#mod-group-max" ).val( "" );
        Materialize.updateTextFields();
        // Enable/disable group min/max fields
        if ( val.indexOf( "not" ) !== -1 || val.indexOf( "if" ) !== -1 || val.indexOf( "and" ) !== -1 ) {
            $( "#mod-group-min" ).attr( "disabled", true );
            $( "#mod-group-max" ).attr( "disabled", true );
        } else {
            $( "#mod-group-min" ).attr( "disabled", false );
            $( "#mod-group-max" ).attr( "disabled", false );
        }
        if ( val.indexOf( "weight" ) !== -1 ) {
            $( ".form-affix-weight" ).show();
            $( ".form-affix-value" ).hide();
        } else {
            $( ".form-affix-weight" ).hide();
            $( ".form-affix-value" ).show();
        }
        // Fill the group min max using values from modGroups
        // Find the mod with the right id in modGroups
        async.eachLimit( Object.keys( modGroups ), 1, function( group, cbGroup ) {
            if ( group === val ) {
                console.log( modGroups[group].min );
                $( "#mod-group-min" ).val( modGroups[group].min );
                $( "#mod-group-max" ).val( modGroups[group].max );
                Materialize.updateTextFields();
            }
            cbGroup();
        });
    });

    // When clicking on 'Clear Filter'
    var cancelEditAction = function() {
        resetFilters();

        // If we are editing and the button is 'Clear Filter'
        if ( $( this ).text() !== "Clear filter" ) {
            $( "#add-filter" ).html( "<i class=\"material-icons\">playlist_add</i><span>Add filter</span>" );
            $( "#cancel-filter" ).html( "<i class=\"material-icons\">delete</i><span>Clear filter</span>" );
            $( "#cancel-filter" ).removeClass( "red" );
            $( "#add-filter" ).removeClass( "green" );
            editingFilter = "";
        }

        editingGroup = "";
        enableElements( elementList );
    };

    var renderAffixes = function( filter, cb ) {
        // Format mods
        var index = 0;
        async.eachLimit( filter.modGroups, 1, function( group, cbGroup ) {
            // Only display non empty groups
            if ( Object.keys( group.mods ).length > 0 ) {
                var generatedModGroup = "";
                var obj = {};
                if ( group.type === "SUM" || group.type === "COUNT" || group.type === "WEIGHT" ) {
                    index++;
                    var groupMinDisp = group.min !== "" ? group.min : "…";
                    var groupMaxDisp = group.max !== "" ? group.max : "…";
                    var parameter    = "( " + groupMinDisp + " - " + groupMaxDisp + " )";
                    obj = {
                        "id":        group.id,
                        "type":      group.type,
                        "index":     "[" + index + "]",
                        "parameter": parameter
                    };
                } else {
                    obj = {
                        "id":        group.id,
                        "type":      group.type,
                        "index":     "",
                        "parameter": ""
                    };
                }
                
                $( "#filter-detail-" + filter.id + " .affix-filter-list" ).append( 
                    "<span class=\"badge badge-" + group.type + "\" data-badge-caption=\"" + group.type + "\"></span>" +
                    "<span class=\"condition-parameter\">" + obj.parameter + "</span><br>"
                );
                async.eachLimit( Object.keys( group.mods ), 1, function( mod, cbMod ) {
                    var weight = "";
                    if ( group.type === "WEIGHT" ) {
                        weight = "Weight: " + group.mods[mod].weight;
                    }
                    var generated = "";
                    // Find out the mod type (explicit, implicit, etc.)
                    var extractReg = /^\(([a-zA-Z ]+)\)\s*/;
                    var sharpReg   = /#/;
                    var match      = extractReg.exec( mod );
                    var matched;
                    if ( !match ) {
                        matched = "Explicit";
                    } else {
                        matched = match[1];
                    }
                    
                    var displayMin = "<span class='value'>" + group.mods[mod].min + "</span>";
                    var displayMax = "<span class='value'>" + group.mods[mod].max + "</span>";
                    var title = mod;
                    var count = ( title.match( /#/g ) || []).length;
                    if ( count > 1 ) {
                        title = title.replace( "#", displayMin );
                        title = title.replace( "#", displayMax );
                    } else {
                        title = mod.replace( 
                            "#", "( " + displayMin + " - " + 
                                        displayMax + " )" );
                    }
                    // title = title.replace( sharpReg, "( " + displayMin + " - " + displayMax + " )" );
                    
                    var obj = {
                        "title":  title.replace( /^\([a-zA-Z ]+\)\s*/, "" ),
                        "id":     Misc.guidGenerator(),
                        "typeLC": matched.toLowerCase(),
                        "type":   matched,
                        "weight": weight
                    };
                    mu.compileAndRender( "affix-filter.html", obj )
                    .on( "data", function ( data ) {
                        generated += data.toString();
                    })
                    .on( "end", function () {
                        // console.log( "Modified: " + generated );
                        // $( "#condition-container-" + group.id ).append( generated );
                        // $( "#" + obj.id ).data( "data-item", obj );
                        // // When clicking on remove affix
                        // $( ".remove-affix" ).click( function() {
                        //     $( this ).parent().parent().remove();
                        // });
                        $( "#filter-detail-" + filter.id + " .affix-filter-list" ).append( generated );
                        cbMod();
                    });
                }, function() {
                    cbGroup();
                });
            } else {
                cbGroup();
            }
        }, function() {
            if ( filter.modGroups.length === 0 ) {
                $( "#filter-detail-" + filter.id + " .affix-filter-list" ).hide();
            }
            cb();
        });
    };

    // When adding a new group
    var addGroupAction = function() {
        var group = {
            name:   "new-group#" + groups.groupList.length,
            id:     Misc.guidGenerator(),
            checked: true,
            color:  "#22ff93"
        };
        group = new Group( group );
        groups.add( group );
        groups.save();
        appendAndBind( group, function() {});
    };

    var formatTitle = function( formData, str ) {
        var min   = 0;
        var max   = 9999999;
        var step  = 0.0001;
        var title = "";
        if ( formData[str] !== "" ) {
            if ( formData[str + "Min"] !== min && formData[str + "Max"] !== max ) {
                title += "<span class=\"filter-property\">" + str + " [" + formData[str + "Min"] + 
                         " - " + formData[str + "Max"] + "]</span>";
            } else if ( formData[str + "Min"] !== min ) {
                if ( formData[str + "Min"] > Math.floor( formData[str + "Min"])) {
                    title += "<span class=\"filter-property\">" + str + " >" + Math.floor(formData[str + "Min"]) + "</span>";
                } else {
                    title += "<span class=\"filter-property\">" + str + " ≥" + formData[str + "Min"] + "</span>";
                }
            } else {
                if ( formData[str + "Max"] < Math.ceil( formData[str + "Max"] )) {
                    title += "<span class=\"filter-property\">" + str + " <" + Math.ceil(formData[str + "Max"]) + "</span>";
                } else {
                    title += "<span class=\"filter-property\">" + str + " ≤" + formData[str + "Max"] + "</span>";
                }
            }
        }
        return title;
    };

    var formatFilter = function( formData, callback ) {
        console.log( modGroups );
        async.eachLimit( Object.keys( modGroups ), 1, function( group, cbGroup ) {
            async.eachLimit( Object.keys( modGroups[group].mods ), 1, function( mod, cbMod ) {
                var cleanedAffix =
                    mod.replace( /(<span class=\'value\'>[^<>]+<\/span>)/g, "#" )
                       .replace( "( # - # )", "#" )
                       .replace( "Unique explicit", "Explicit" )
                       .replace( "Essence", "Explicit" )
                       .replace( "Talisman implicit", "Implicit" );
                    formData.affixes[cleanedAffix] = {
                        "min": modGroups[group].mods[mod].min, 
                        "max": modGroups[group].mods[mod].max,
                        "type": modGroups[group].type
                    };
                    var count = ( mod.match( /#/g ) || []).length;
                    var affix = "";
                    if ( count > 1 ) {
                        affix = mod.replace( "#", formData.affixes[cleanedAffix].min );
                        affix = affix.replace( "#", formData.affixes[cleanedAffix].max );
                    } else {
                        affix = mod.replace( 
                            "#", "( " + formData.affixes[cleanedAffix].min + " - " + 
                                        formData.affixes[cleanedAffix].max + " )" );
                    }
                cbMod();
            }, function() {
                cbGroup();
            });
        }, function() {
            formData.modGroups = modGroups;
        });
    
        // If filter has a budget, make sure the budget has <= 2 
        // trailing digits and save it
        if ( formData.budget ) {
            formData.budget = Math.round( formData.budget * 100 ) / 100;
            formData.displayPrice = formData.budget + " " + formData.currency;
        // Otherwise save "Any price" as the display price
        } else {
            formData.displayPrice = "Any price";
        }

        formData.currency = Currency.shortToLongLookupTable[formData.currency];

        // Format the filter title
        var title = "";
        if ( formData.corrupted === "true" ) {
            title += "<span class=\"filter-corrupted\">Corrupted</span>";
        }
        if ( formData.enchanted === "true" ) {
            title += "<span class=\"filter-enchanted\">Enchanted</span>";
        }
        if ( formData.crafted === "true" ) {
            title += "<span class=\"filter-crafted\">Crafted</span>";
        }
        if ( formData.itemType !== "any" && formData.itemType !== "" ) {
            title += "<span style=\"padding-right: 10px;\">" + formData.item + "(any " + formData.itemType + ")</span>";
        } else {
            title += "<span style=\"padding-right: 10px;\">" + formData.item + "</span>";
        }
        if ( formData.links !== "0" && formData.links !== "45" && formData.links !== "any" ) {
            title += "<span class=\"filter-links\">" + formData.links + "L</span>";
        } else if ( formData.links === "0" ) {
            title += "<span class=\"filter-links\">< 5L</span>";
        } else if ( formData.links === "45" ) {
            title += "<span class=\"filter-links\">< 6L</span>";
        }

        var total;
        if ( formData.socketsTotal === "" ) {
            total = 0;
        } else {
            total = formData.socketsTotal;
        }
        var string       = "";
        var detailSocket = "";
        if ( formData.socketsRed !== "" && formData.socketsRed !== 0 ) {
            if ( formData.socketsTotal === "" ) {
                total  += parseInt( formData.socketsRed );
            }
            detailSocket += formData.socketsRed + "R ";
        }
        if ( formData.socketsGreen !== "" && formData.socketsGreen !== 0 ) {
            if ( formData.socketsTotal === "" ) {
                total  += parseInt( formData.socketsGreen );
            }
            detailSocket += formData.socketsGreen + "G ";
        }
        if ( formData.socketsBlue !== "" && formData.socketsBlue !== 0 ) {
            if ( formData.socketsTotal === "" ) {
                total  += parseInt( formData.socketsBlue );
            }
            detailSocket += formData.socketsBlue + "B ";
        }
        if ( formData.socketsWhite !== "" && formData.socketsWhite !== 0 ) {
            if ( formData.socketsTotal === "" ) {
                total  += parseInt( formData.socketsWhite );
            }
            detailSocket += formData.socketsWhite + "W ";
        }
        if ( detailSocket !== "" ) {
            string = total + "S ( " + detailSocket + ")";
        } else {
            string = total + "S";
        }
        if ( total > 0 ) {
            title += "<span class=\"filter-sockets\">" + string + "</span>";
        }

        title += formatTitle( formData, "armor" );
        title += formatTitle( formData, "es" );
        title += formatTitle( formData, "evasion" );
        title += formatTitle( formData, "dps" );
        title += formatTitle( formData, "pdps" );
        title += formatTitle( formData, "edps" );
        title += formatTitle( formData, "quality" );
        title += formatTitle( formData, "level" );
        title += formatTitle( formData, "tier" );
        title += formatTitle( formData, "experience" );
        title += formatTitle( formData, "mapPackSize" );
        title += formatTitle( formData, "mapQuantity" );
        title += formatTitle( formData, "mapRarity" );
        title += formatTitle( formData, "openPrefixes" );
        title += formatTitle( formData, "openSuffixes" );

        // If we're editing an existing filter, keep the current filter id
        // otherwise generate a new one
        var filterId = editingFilter !== "" ? editingFilter : Misc.guidGenerator();
        formData.id = filterId;

        formData.title  = title;
        formData.active = true;
        callback( formData );
    };

    // When adding a new filter
    var addFilterAction = function() {

        if ( editingGroup ) {
            applyGroupEdition( editingGroup );
        } else {
            // Get all filter data from the form
            fetchFormData( function( formData ) {
                console.log( formData );
                // var re         = /([0-9.]+)/g;
                formatFilter( formData, function( formData ) {
                    var filter;
                    // If editing the filter, search for its group
                    if ( editingFilter !== "" ) {
                        async.each( filters.filterList, function( filter, cbFilter ) {
                            if ( filter.id === editingFilter ) {
                                formData.group = filter.group;
                            }
                            cbFilter();
                        }, function() {
                            filter = new Filter( formData );
                        });
                    // Otherwise, assign an empty group value
                    } else {
                        formData.group = "";
                        filter = new Filter( formData );
                    }
                    // console.log( formData );
                    
                    // Add new filter
                    if ( $( "#add-filter" ).text() === "playlist_addAdd filter" ) {
                        filters.add( filter );
                        console.log( filter );
                        filters.findFilterIndex( filter, function( res ) {
                            console.log( res );
                            filters.save();
                            filter.render( function( generated ) {
                                postRender( filter, generated, res.index );
                            });
                        });
                    // Update existing filter
                    } else {
                        filters.update( filter, function() {
                            console.log( filters );
                            filter.render( function( generated ) {
                                filters.findFilterIndex( filter, function( res ) {
                                    postRender( filter, generated, res.index );
                                });
                            });
                        });
                        filters.save();
                    }
                });
            });
        }
    };

    // Helpers

    /**
     * Setup autocompletion for both name and affixes
     *
     * @params Nothing
     * @return Nothing
     */
    var setupAutocomplete = function() {
        // Setup name completion
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
                limit: 20
            });
            // Close on Escape
            $( '#item' ).keydown( function( e ) {
                if ( e.which == 27 ) {
                    $( ".autocomplete-content" ).empty();
                }
            });

            // Setup affix completion
            var affixCompletion = require( "./affix-completion.json" );
            // console.log( affixCompletion );
            $( '#affixes' ).autocomplete({
                data: affixCompletion,
                limit: 20
            });
            // Close on Escape
            $( '#affixes' ).keydown( function( e ) {
                if ( e.which == 27 ) {
                    $( ".autocomplete-content" ).empty();
                }
            });

            $( '#affixes' ).keyup( function( e ) {
                var code = e.which;
                // If the key is a letter, a number, a space or backspace
                if ( code >= 65 && code <= 90 || code >= 48 && code <= 57 || code === 32 || code === 8 ) {
                    $( ".autocomplete-content li span:visible" ).each( function() {
                        var text  = $( this ).text();
                        var reg   = /\[(.*)\]/;
                        var match = reg.exec( text );
                        if ( match && match[1]) {
                            text = text.replace( "[" + match[1] + "]", "" ).trim();
                            var affixType = "affix-" + match[1].toLowerCase();
                            $( this ).html( 
                                "<span class='badge " + affixType + "' data-badge-caption='" + match[1] + 
                                "'></span>" + text );
                        } else {
                            // $( this ).html( "<span class='badge red' data-badge-caption='Unknown'></span>" + text );
                        }
                        // When selecting an item in the completion menu
                        $( this ).click( function () {
                            var affixType = $( this ).find( ".badge" ).data( "badge-caption" );
                            var affixName = $( this ).text();
                            setTimeout( function() { $( "#affixes" ).val( "(" + affixType + ") " + affixName ); }, 1 );
                        });
                    });
                }
            });

            // Setup type completion
            var typeCompletion = require( "./type-completion.json" );
            $( '#item-type' ).autocomplete({
                data: typeCompletion,
                limit: 20
            });
            // Close on Escape
            $( '#item-type' ).keydown( function( e ) {
                if ( e.which == 27 ) {
                    $( ".autocomplete-content" ).empty();
                }
            });

            // Setup blacklist reasons completion
            $( '#blacklist-reason' ).autocomplete({
                data: {
                    "Scammer": null,
                    "Bot": null,
                    "Price fixing": null,
                    "Low balling": null,
                    "Ignoring messages": null,
                    "No intent to sell": null
                },
                limit: 20
            });
            // Close on Escape
            $( '#blacklist-reason' ).keydown( function( e ) {
                if ( e.which == 27 ) {
                    $( ".autocomplete-content" ).empty();
                }
            });
        });
    };
    
    // Return min and max values for a given filter dimension, depending on the
    // expression
    var parseField = function( value, str ) {
        var data = {};
        var step = 0.0001;
        var max  = 9999999;
        var min  = 0;
        // Match mathematic operators <, <=, >, >=
        var symbolReg = /(\<|\<=|\>|\>=)\s*([0-9.]+)/;
        var rangeReg  = /([0-9.]+)\s*\-\s*([0-9]+)/; // Match ranges
        var match = symbolReg.exec( value );
        // If we have an expression with <, <=, > or >=
        if ( match ) {
            switch ( match[1]) {
                case "<":
                    data[str + "Min"] = min;
                    data[str + "Max"] = parseFloat( match[2]) - step;
                break;
                case "<=":
                    data[str + "Min"] = min;
                    data[str + "Max"] = parseFloat( match[2]);
                break;
                case ">":
                    data[str + "Min"] = parseFloat( match[2]) + step;
                    data[str + "Max"] = max;
                break;
                case ">=":
                    data[str + "Min"] = parseFloat( match[2]);
                    data[str + "Max"] = max;
                break;
            }
            return data;
        } else {
            // If we have a range, extract min and max values
            match = rangeReg.exec( value );
            if ( match ) {
                data[str + "Min"] = parseFloat( match[1]);
                data[str + "Max"] = parseFloat( match[2]);
                return data;
            // By default, only specify min value
            } else {
                data[str + "Min"] = parseFloat( value );
                data[str + "Max"] = max;
                return data;
            }
        }
    };

    /**
     * Fetch information from filled form data
     *
     * @params callback
     * @return return collected data through callback
     */
    var fetchFormData = function( callback ) {
        var data          = {};
        data.league       = $( "#league" ).val();
        data.item         = $( "#item" ).val();
        data.budget       = $( "#price" ).val();
        data.currency     = $( "#currency" ).val();
        data.links        = $( "#links" ).val();
        data.socketsTotal = $( "#sockets-total" ).val();
        data.socketsRed   = $( "#sockets-red" ).val();
        data.socketsGreen = $( "#sockets-green" ).val();
        data.socketsBlue  = $( "#sockets-blue" ).val();
        data.socketsWhite = $( "#sockets-white" ).val();
        data.corrupted    = $( "#corrupted" ).val();
        data.crafted      = $( "#crafted" ).val();
        data.enchanted    = $( "#enchanted" ).val();
        data.identified   = $( "#identified" ).val();
        data.level        = $( "#level" ).val();
        var levelData     = parseField( data.level, "level" );
        Object.assign( data, levelData );
        data.tier         = $( "#tier" ).val();
        var tierData      = parseField( data.tier, "tier" );
        Object.assign( data, tierData );
        data.experience   = $( "#experience" ).val();
        var experienceData= parseField( data.experience, "experience" );
        Object.assign( data, experienceData );
        data.quality      = $( "#quality" ).val();
        var qualityData   = parseField( data.quality, "quality" );
        Object.assign( data, qualityData );
        data.rarity       = $( "#rarity" ).val();
        data.armor        = $( "#armor" ).val();
        var armorData     = parseField( data.armor, "armor" );
        Object.assign( data, armorData );
        data.es           = $( "#es" ).val();
        var esData        = parseField( data.es, "es" );
        Object.assign( data, esData );
        data.evasion      = $( "#evasion" ).val();
        var evasionData   = parseField( data.evasion, "evasion" );
        Object.assign( data, evasionData );
        data.dps          = $( "#dps" ).val();
        var dpsData       = parseField( data.dps, "dps" );
        Object.assign( data, dpsData );
        data.pdps         = $( "#pdps" ).val();
        var pdpsData      = parseField( data.pdps, "pdps" );
        Object.assign( data, pdpsData );
        data.edps         = $( "#edps" ).val();
        var edpsData      = parseField( data.edps, "edps" );
        Object.assign( data, edpsData );
        data.buyout       = $( "#price-bo" ).is(":checked");
        data.clipboard    = $( "#clipboard" ).is(":checked");
        data.convert      = $( "#convert-currency" ).is(":checked");
        data.itemType     = $( "#item-type" ).val();
        data.openPrefixes = $( "#open-prefixes" ).val();
        var openPrefixesData     = parseField( data.openPrefixes, "openPrefixes" );
        Object.assign( data, openPrefixesData );
        data.openSuffixes = $( "#open-suffixes" ).val();
        var openSuffixesData     = parseField( data.openSuffixes, "openSuffixes" );
        Object.assign( data, openSuffixesData );
        data.mapQuantity  = $( "#map-quantity" ).val();
        var mapQuantityData     = parseField( data.mapQuantity, "mapQuantity" );
        Object.assign( data, mapQuantityData );
        data.mapRarity    = $( "#map-rarity" ).val();
        var mapRarityData     = parseField( data.mapRarity, "mapRarity" );
        Object.assign( data, mapRarityData );
        data.mapPackSize  = $( "#map-pack-size" ).val();
        var mapPackSizeData     = parseField( data.mapPackSize, "mapPackSize" );
        Object.assign( data, mapPackSizeData );
        data.affixesDis   = [];
        data.affixes      = {};
        callback( data );
    };

    /**
     * Color item name depending on rarity
     *
     * @params filter
     * @return nothing
     */
    var colorRarity = function( filter ) {
        if ( filter.rarity === "1" ) {
            $( "#filter-detail-" + filter.id + " .item" ).addClass( "magic" );
        } else if ( filter.rarity === "2" ) {
            $( "#filter-detail-" + filter.id + " .item" ).addClass( "rare" );
        } else if ( filter.rarity === "3" ) {
            $( "#filter-detail-" + filter.id + " .item" ).addClass( "unique" );
        } else if ( filter.rarity === "4" ) {
            $( "#filter-detail-" + filter.id + " .item" ).addClass( "gem" );
        } else if ( filter.rarity === "5" ) {
            $( "#filter-detail-" + filter.id + " .item" ).addClass( "currency" );
        } else if ( filter.rarity === "6" ) {
            $( "#filter-detail-" + filter.id + " .item" ).addClass( "divination" );
        } else if ( filter.rarity === "8" ) {
            $( "#filter-detail-" + filter.id + " .item" ).addClass( "prophecy" );
        } else if ( filter.rarity === "9" ) {
            $( "#filter-detail-" + filter.id + " .item" ).addClass( "legacy" );
        } else if ( filter.rarity === "not-unique" ) {
            $( "#filter-detail-" + filter.id + " .item" ).addClass( "not-unique" );
        }
    };

    var updateFilterAmount = function( id ) {
        // If filters are folded, count the amount of filters in the array
        if ( $( "#fold-filters" ).hasClass( "folded" )) {
            $( "#filters-amount" ).text( filters.length );
        // Otherwise count the visible filters
        } else {
            $( "#filters-amount" ).text( $( "#filters .collection-item:visible" ).length );
        }
        bindRemoveFilter( id );
    };

    // Hide/show filter processing time
    var displayTimes = function() {
        if ( config.showFilterProcessingTime ) {
            $( ".performance-info" ).show();
        } else {
            $( ".performance-info" ).hide();
        }
    };

    // Hide/show search engines (poe.trade, poe-rates, etc.)
    var displaySearchEngines = function() {
        if ( config.showPoeTradeLink ) {
            $( ".search-engines" ).show();
            $( ".poe-trade-link" ).show();
        } else {
            $( ".poe-trade-link" ).hide();
        }
        if ( config.showPoeNinjaLink ) {
            $( ".search-engines" ).show();
            $( ".poe-ninja-link" ).show();
        } else {
            $( ".poe-ninja-link" ).hide();
        }
        if ( config.showPoeRatesLink ) {
            $( ".search-engines" ).show();
            $( ".poe-rates-link" ).show();
        } else {
            $( ".poe-rates-link" ).hide();
        }
        if ( config.showPoeWikiLink ) {
            $( ".search-engines" ).show();
            $( ".poe-wiki-link" ).show();
        } else {
            $( ".poe-wiki-link" ).hide();
        }
        if ( !config.showPoeNinjaLink && !config.showPoeRatesLink && !config.showPoeTradeLink && !config.showPoeWikiLink ) {
            $( ".search-engines" ).hide();
        }
    };

    // When clicking on the the symbol, remove all items
    // associated to a given filter
    var clearTaggedItems = function( tag ) {
        $( "#" + tag + "-clear" ).click( function( event ) {
            event.stopPropagation();
            console.log( "clearing tagged items" );
            $( ".entry" ).each( function() { 
                if ( $( this ).data( "tag" ) === tag ) { 
                    var id       = $( this ).data( "item" ).itemId;
                    var visualId = $( this ).data( "item" ).id;
                    console.log( id );
                    delete results[visualId];
                    delete resultsId[id];
                    delete prices[id];
                    delete entryLookup[id];
                    console.log( results );
                    $( this ).remove(); 
                }
            });
        });
    };

    // When clicking on the trash sign, remove tagged items
    var bindRemoveTaggedItems = function( id ) {
        clearTaggedItems( id );
    };

    // Clear all entries found by filters within this group
    var clearGroup = function( group ) {
        $( "#" + group.id + "-clear-group" ).click( function( event ) {
            async.each( filters.filterList, function( filter, cbFilter ) {
                if ( filter.group === group.id ) {
                    $( ".entry" ).each( function() { 
                        if ( $( this ).data( "tag" ) === filter.id ) { 
                            var id       = $( this ).data( "item" ).itemId;
                            var visualId = $( this ).data( "item" ).id;
                            delete results[visualId];
                            delete resultsId[id];
                            delete prices[id];
                            delete entryLookup[id];
                            $( this ).remove(); 
                        }
                    });
                } else {

                }
                cbFilter();
            }, function() {

            });
        });
    };

    // When clicking on the minus sign, remove filter
    var bindRemoveFilter = function( id ) {
        $( "#" + id + ".remove-filter" ).click( function( e ) {
            e.stopPropagation();
            // Remove this entry
            $( this ).parent().parent().parent().parent().remove();
            var newFilters = [];
            var id         = $( this ).attr( "id" );
            // Search for filter index and remove it from the array
            async.each( filters.filterList, function( filter, cb ) {
                if ( filter.id !== id ) {
                    newFilters.push( filter );
                }
                cb();
            }, function( err ) {
                if ( err ) {
                    console.log( err );
                }
                filters = new Filters( newFilters );
                console.log( filters );
                updateFilterAmount( id );
                filters.save();
                // Remove poe.trade form
                $( "#" + id + "-poe-trade-form" ).remove();
            });
        });
    };

    var foldGroup = function( id ) {
        $( "#fold-group-" + id ).toggleClass( "folded" );
        // If group was unfolded
        var folded = true;
        if ( $( "#fold-group-" + id ).hasClass( "folded" )) {
            // Fold content
            $( "#filter-group-content-" + id ).slideUp();
        // Otherwise
        } else {
            // Unfold content
            folded = false;
            $( "#filter-group-content-" + id ).slideDown();
        }
        async.each( groups.groupList, function( group, cbGroup ) {
            if ( group.id === id ) {
                group.folded = folded;
            }
            cbGroup();
        }, function() {
            groups.save();
        });
    };

    // Count filters within a group
    var countItemsInGroup = function( group, callback ) {
        var counter = 0;
        async.each( filters.filterList, function( filter, cbFilter ) {
            if ( filter.group === group.id ) {
                counter++;
            }
            cbFilter();
        }, function() {
            callback( counter );
        });
    };

    var appendAndBind = function( group, callback ) {
        group.render( function( generated ) {
            $( "#filters ul.filter-collection" ).prepend( generated );

            // Count filters in the group and update the counter above the group
            countItemsInGroup( group, function( counter ) {
                $( "#filter-group-detail-" + group.id + " .group-amount" ).text( counter + " filters" );
            });

            // Bind group edit
            bindFilterGroupEdit( group.id );

            // Setup color picker for groups
            var ele = $( "#filter-group-detail-" + group.id + " .color-picker" ).spectrum({
                color: group.color,
                move: function( color ) {
                    var hex = color.toHexString();
                    $( "#filter-group-detail-" + group.id + " input.item" ).css({
                        "color": hex
                    });
                },
                hide: function( color ) {
                    var hex = color.toHexString();
                    group.color = hex;
                    $( "#filter-group-detail-" + group.id + " input.item" ).css({
                        "color": group.color
                    });
                    groups.save();
                }
            });
            // Align the color picker to the right
            $( "#filter-group-detail-" + group.id + " .sp-replacer" ).addClass( "right" );

            // Restore saved folded state
            if ( group.folded ) {
                // Unfold content
                $( "#fold-group-" + group.id ).addClass( "folded" );
                $( "#filter-group-content-" + group.id ).slideUp();
            }
            $( "#fold-group-" + group.id ).click( function() {
                foldGroup( group.id );
            });
            if ( config.showFilterProcessingTime ) {
                $( ".performance-info" ).show();
            }
            // When clicking on title, allow to edit
            $( "#filter-group-detail-" + group.id + " .item" ).keyup( function() {
                var newName = $( this ).val();
                console.log( newName );
                async.each( groups.groupList, function( groupIt, cbGroup ) {
                    if ( groupIt.id === group.id ) {
                        groupIt.name = newName;
                    }
                    cbGroup();
                }, function() {
                    console.log( "Saving groups" );
                    groups.save();
                    callback();
                });
            });
            // When clicking on clear group
            clearGroup( group );
            // When clicking on remove group
            $( "#remove-group-" + group.id ).click( function() {
                console.log( "Removing group " + group.id );
                groups.remove( group.id, function() {
                    $( "#" + group.id ).remove();
                    groups.save();
                    // remove all filters in this group
                    var newFilters = [];
                    async.each( filters.filterList, function( filter, cbFilter ) {
                        if ( filter.group !== group.id ) {
                            newFilters.push( filter );
                        } else {
                            console.log( "Removing filter id: " + filter.id );
                        }
                        cbFilter();
                    }, function() {
                        filters.filterList = newFilters;
                        filters.save();
                    });
                });
            });
        });
    };

    // Load item black-list
    var loadItemBlackList = function( callback ) {
        var itemBlackList;
        if ( !fs.existsSync( app.getPath( "userData" ) + path.sep + "item-blacklist.json" )) {
            console.log( "Item blacklist file does not exist, creating it" );
            var readStream  = fs.createReadStream( __dirname + path.sep + "item-blacklist.json" );
            var writeStream = fs.createWriteStream( app.getPath( "userData" ) + path.sep + "item-blacklist.json" );
            writeStream.on( "close", function() {
                itemBlackList = require( app.getPath( "userData" ) + path.sep + "item-blacklist.json" );
                callback( new BlackList( "item-blacklist", itemBlackList.entries ));
            });
            readStream.pipe( writeStream );
        } else {
            console.log( "Loading item blacklist from " + app.getPath( "userData" ) + path.sep + "item-blacklist.json" );
            itemBlackList = require( app.getPath( "userData" ) + path.sep + "item-blacklist.json" );
            callback( new BlackList( "item-blacklist", itemBlackList.entries ));
        }
    };

    // Load player black-list
    var loadPlayerBlackList = function( callback ) {
        var playerBlackList;
        if ( !fs.existsSync( app.getPath( "userData" ) + path.sep + "player-blacklist.json" )) {
            console.log( "Player blacklist file does not exist, creating it" );
            var readStream  = fs.createReadStream( __dirname + path.sep + "player-blacklist.json" );
            var writeStream = fs.createWriteStream( app.getPath( "userData" ) + path.sep + "player-blacklist.json" );
            writeStream.on( "close", function() {
                playerBlackList = require( app.getPath( "userData" ) + path.sep + "player-blacklist.json" );
                callback( new BlackList( "player-blacklist", playerBlackList.entries ));
            });
            readStream.pipe( writeStream );
        } else {
            console.log( "Loading player blacklist from " + app.getPath( "userData" ) + path.sep + "player-blacklist.json" );
            playerBlackList = require( app.getPath( "userData" ) + path.sep + "player-blacklist.json" );
            callback( new BlackList( "player-blacklist", playerBlackList.entries ));
        }
    };

    // Load filter groups
    var loadFilterGroups = function( callback ) {
        var groupData;
        if ( !fs.existsSync( app.getPath( "userData" ) + path.sep + "filter-groups.json" )) {
            console.log( "Groups file does not exist, creating it" );
            var readStream  = fs.createReadStream( __dirname + path.sep + "filter-groups.json" );
            var writeStream = fs.createWriteStream( app.getPath( "userData" ) + path.sep + "filter-groups.json" );
            writeStream.on( "close", function() {
                groupData = require( app.getPath( "userData" ) + path.sep + "filter-groups.json" );
            });
            readStream.pipe( writeStream );
        } else {
            console.log( "Loading groups from " + app.getPath( "userData" ) + path.sep + "filter-groups.json" );
            groupData = require( app.getPath( "userData" ) + path.sep + "filter-groups.json" );
        }
        async.each( groupData, function( group, cbGroup ) {
            group = new Group( group );
            groups.add( group );
            cbGroup();
        }, function() {
            async.each( groups.groupList, function( group, cbSorted ) {
                appendAndBind( group, function() {});
                cbSorted();
            }, function() {
                callback();
            });
        });
    };

    // Load filters
    var loadFilters = function( callback ) {
        // Load filters file in memory
        // If filters exist in app data, use them, otherwise copy
        // the default file to app data folder
        
        window.dragOver = function( event ) {
            event.preventDefault();
            var data = event.dataTransfer.getData( "text" );
            if ( $( event.target ).parents( ".filter-detail-group" ).length > 0 ) {
                $( event.target ).parents( ".filter-detail-group" ).addClass( "droppable" );
            } else {
                $( event.target ).removeClass( "droppable" );
            }
        };

        window.dragEnd = function( event ) {
            $( ".droppable" ).removeClass( "droppable" );
        };

        window.dragLeave = function( event ) {
            $( event.target ).removeClass( "droppable" );
        };
        
        window.drag = function( event ) {
            event.dataTransfer.setData( "text", event.target.id );
        };
        
        window.drop = function( event ) {
            event.preventDefault();
            var data = event.dataTransfer.getData( "text" );
            // If filter was dropped into a group, set its group attribute
            // and append it to the group
            if ( $( event.target ).parents( ".filter-detail-group" ).length > 0 ) {
                $( event.target ).parents( ".filter-detail-group" ).find( ".filter-group-content" ).append( document.getElementById( data ) );
                $( event.target ).removeClass( "droppable" );
                var groupId;
                async.each( filters.filterList, function( filter, cbFilter ) {
                    if ( filter.id === data.replace( "filter-", "" )) {
                        filter.group = $( event.target ).parents( ".filter-detail-group" ).find( ".filter-group-content" ).attr( "id" ).replace( "filter-group-content-", "" );
                        groupId = filter.group;
                    }
                    bindGroupToggleState( filter.group );
                    // console.log( filter.id + ":" + data.replace( "filter-", "" ) + ":" + event.target );
                    cbFilter();
                }, function() {
                    filters.save();
                    // Count filters in the group and update the counter above the group
                    countItemsInGroup( { id: groupId }, function( counter ) {
                        console.log( "Counted " + counter + " filters" );
                        $( "#filter-group-detail-" + groupId + " .group-amount" ).text( counter + " filters" );
                    });
                });
            // If filter was dropped into the main list, remove its group
            // attribute and append it to the main filter list
            } else if ( $( event.target ).parents().find( ".filter-collection" ).length > 0 ) {
                $( ".filter-collection" ).append( document.getElementById( data ) );
                $( event.target ).removeClass( "droppable" );
                var groupId;
                async.each( filters.filterList, function( filter, cbFilter ) {
                    if ( filter.id === data.replace( "filter-", "" )) {
                        groupId = filter.group;
                        filter.group = "";
                    }
                    // console.log( filter.id + ":" + data.replace( "filter-", "" ) + ":" + event.target );
                    cbFilter();
                }, function() {
                    filters.save();
                    // Count filters in the group and update the counter above the group
                    countItemsInGroup({ id: groupId }, function( counter ) {
                        console.log( "Counted " + counter + " filters" );
                        $( "#filter-group-detail-" + groupId + " .group-amount" ).text( counter + " filters" );
                    });
                });
            } else {
                console.log( $( event.target ).attr( "class" ));
            }
        };

        var filterData = {};
        if ( !fs.existsSync( app.getPath( "userData" ) + path.sep + "filters.json" )) {
            console.log( "Filters file does not exist, creating it" );
            var readStream  = fs.createReadStream( __dirname + path.sep + "filters.json" );
            var writeStream = fs.createWriteStream( app.getPath( "userData" ) + path.sep + "filters.json" );
            writeStream.on( "close", function() {
                filterData = require( app.getPath( "userData" ) + path.sep + "filters.json" );
            });
            readStream.pipe( writeStream );
        } else {
            console.log( "Loading filters from " + app.getPath( "userData" ) + path.sep + "filters.json" );
            filterData = require( app.getPath( "userData" ) + path.sep + "filters.json" );
        }

        // For each filter, generate using the 'filter' template
        // and add them to the filters array
        async.each( filterData, function( filter, cbFilter ) {
            if ( !filter.displayPrice && filter.budget && filter.budget > 0 ) {
                filter.displayPrice = filter.budget + " " + filter.currency;
            } else if ( !filter.displayPrice && ( !filter.budget || filter.budget === 0 )) {
                filter.displayPrice = "Any price";
            }

            filter = new Filter( filter );
            filters.add( filter );
            cbFilter();
        }, function( err ) {
            if ( err ) {
                console.log( err );
            }
            console.log( filters );
            async.each( filters.filterList, function( filter, cbSorted ) {
                filter.render( function( generated ) {
                    groups.find( filter.group, function( groupExist ) {
                        // If filter doesn't have a group or the group doesn't exist 
                        // add it to the main list
                        if ( !filter.group || filter.group === "" || !groupExist ) {
                            console.log( "Adding filter to main list" );
                            $( "#filters ul.filter-collection" ).append( generated );
                        // Otherwise add it to the group
                        } else {
                            // console.log( "Adding filter " + filter.id + " to group id " + filter.group );
                            $( "#filter-group-content-" + filter.group ).append( generated );
                        }
                        // Format mods
                        renderAffixes( filter, function() {
                            // Color item name depending on rarity
                            colorRarity( filter );
                            if ( filter.buyout ) {
                                $( "#filter-detail-" + filter.id + " .buyout" ).hide();
                            }
                            if ( !filter.clipboard ) {
                                $( "#filter-detail-" + filter.id + " .clipboard" ).hide();
                            }
                            colorFilter( filter );
                            bindFilterToggleState( filter.id );
                            bindFilterEdit( filter.id, function() {});
                            updateFilterAmount( filter.id );
                            cbSorted();
                            addPoeTradeForm( filter );
                            bindRemoveTaggedItems( filter.id );
                            // console.log( filter );
                        });
                    });
                });
            }, function( err ) {
                if ( err ) {
                    console.log( err );
                }
                filters.save();
                $( ".search-engines a" ).unbind();
                $( ".search-engines a" ).click( function( event ) {
                    event.preventDefault();
                    event.stopPropagation();
                    var id = $( this ).data( "item" );
                    if ( id ) {
                        $( "#" + id ).unbind();
                        $( "#" + id ).submit( function( event ){
                            $.ajax({
                                url: 'http://poe.trade/search',
                                data: $( this ).serialize(),
                                type: 'POST', 
                                success: function( data ) {
                                    var wrapper = document.getElementById( "poe-trade-link" );
                                    wrapper.innerHTML = data;
                                    $( "#poe-trade-link script" ).remove();
                                    $( "#poe-trade-link link" ).remove();
                                    var link = "http://poe.trade" + $( "#poe-trade-link .live-search-box a" ).attr( "href" ).replace( "/live", "" );
                                    open( link );
                                }
                            });
                            return false;
                        });
                        $( "#" + id ).submit();
                    } else {
                        open( $( this ).attr( "href" ));
                    }
                });
                // Hide or show elements
                displaySearchEngines();
                displayTimes();
                console.log( "Calling poe.trade stats" );
                poeTradeStats( filters.filterList );
                callback();
            });
        });
    };

    /**
     * Color filter based on item name to help visually differentiate
     *
     * @params Filter
     * @return Nothing
     */
    var colorFilter = function( filter ) {
        if ( itemTypes["Divination-card"].types.indexOf( filter.item ) !== -1 ) {
            $( "#filter-detail-" + filter.id + " .item" ).addClass( "divination" );
        } else if ( itemTypes["Prophecy"].types.indexOf( filter.item ) !== -1 ) {
            $( "#filter-detail-" + filter.id + " .item" ).addClass( "prophecy" );
        } else if ( itemTypes["unique"].types.indexOf( filter.item ) !== -1 ) {
            $( "#filter-detail-" + filter.id + " .item" ).addClass( "unique" );
        } else if ( itemTypes["Currency"].types.indexOf( filter.item ) !== -1 ) {
            $( "#filter-detail-" + filter.id + " .item" ).addClass( "currency" );
        } else if ( itemTypes["Gem"].types.indexOf( filter.item ) !== -1 ) {
            $( "#filter-detail-" + filter.id + " .item" ).addClass( "gem" );
        } else if ( itemTypes["Map"].types.indexOf( filter.item ) !== -1 ) {
            $( "#filter-detail-" + filter.id + " .item" ).addClass( "map" );
        } else if ( itemTypes["Fragment"].types.indexOf( filter.item ) !== -1 ) {
            $( "#filter-detail-" + filter.id + " .item" ).addClass( "fragment" );
        } else if ( itemTypes["Essence"].types.indexOf( filter.item ) !== -1 ) {
            $( "#filter-detail-" + filter.id + " .item" ).addClass( "essence" );
        } 
    };

    /**
     * View update after creating a new filter
     *
     * @params Filter object, generated HTML code and position
     * @return Nothing
     */
    var postRender = function( filter, generated, position ) {
        var last = false;
        // If new item, is the last in the list
        if (( $( "#filters ul li" ).length > 0 && 
              position + 1 > $( "#filters ul li" ).length - 1 ) || 
              ( position + 1 > $( "#filters ul li" ).length )) {
            last = true;
            // console.log( "Last in list" );
        }
        // If we're adding a new filter
        if ( $( "#add-filter" ).text() === "playlist_addAdd filter" ) {
            if ( filter.group !== "" ) {
                $( "#filter-group-content-" + filter.group ).append( generated );
            } else {
                if ( last ) {
                    $( "#filters ul.filter-collection" ).append( generated );
                } else {
                    $( generated ).insertBefore( $( "#filters ul li" )[position] );
                }
            }
        // If we're editing an existing filter
        } else {
            $( "#filters ul li" ).has( "#" + editingFilter ).remove();
            if ( filter.group !== "" ) {
                console.log( filter );
                $( "#filter-group-content-" + filter.group ).append( generated );
            } else {
                console.log( filter );
                if ( last ) {
                    $( "#filters ul.filter-collection" ).append( generated );
                } else {
                    $( generated ).insertBefore( $( "#filters ul li" )[position] );
                }
            }
            editingFilter = "";
            $( "#add-filter" ).html( "<i class=\"material-icons\">playlist_add</i><span>Add filter</span>" );
            $( "#cancel-filter" ).html( "<i class=\"material-icons\">delete</i><span>Clear filter</span>" );
            $( "#cancel-filter" ).removeClass( "red" );
            $( "#add-filter" ).removeClass( "green" );
        }
        renderAffixes( filter, function() {});
        // Color item name depending on rarity
        colorRarity( filter );
        // console.log( filter.buyout );
        if ( filter.buyout ) {
            $( "#filter-detail-" + filter.id + " .buyout" ).hide();
        }
        if ( !filter.clipboard ) {
            $( "#filter-detail-" + filter.id + " .clipboard" ).hide();
        }
        colorFilter( filter );
        bindFilterToggleState( filter.id );
        bindFilterEdit( filter.id, function() {});
        bindRemoveTaggedItems( filter.id );
        updateFilterAmount( filter.id );
        console.log( "Calling poe.trade stats" );
        poeTradeStats([filter]);
        $( ".search-engines a" ).unbind();
        $( ".search-engines a" ).click( function( event ) {
            event.preventDefault();
            event.stopPropagation();
            var id = $( this ).data( "item" );
            if ( id ) {
                $( "#" + id ).unbind();
                $( "#" + id ).submit( function( event ){
                    $.ajax({
                        url: 'http://poe.trade/search',
                        data: $( this ).serialize(),
                        type: 'POST', 
                        success: function( data ) {
                            var wrapper = document.getElementById( "poe-trade-link" );
                            wrapper.innerHTML = data;
                            $( "#poe-trade-link script" ).remove();
                            $( "#poe-trade-link link" ).remove();
                            var link = "http://poe.trade" + $( "#poe-trade-link .live-search-box a" ).attr( "href" ).replace( "/live", "" );
                            open( link );
                        }
                    });
                    return false;
                });
                $( "#" + id ).submit();
            } else {
                open( $( this ).attr( "href" ));
            }
        });
        // If filters are folded, unfold them
        if ( $( "#fold-filters" ).hasClass( "folded" )) {
            foldFilters();
        }
        addPoeTradeForm( filter );
        displaySearchEngines();
        displayTimes();
        filterFilterListAction();
    };

    // Render poe.trade form for search link
    var renderPoeTradeForm = function( filter, cb ) {
        var generated = "";
        if ( filter.itemType === "any" ) {
            filter.poeTradeType = "";
        } else {
            filter.poeTradeType = matchPoeTradeTypeWithInternal( filter.itemType );
        }
        // console.log( filter );
        mu.compileAndRender( "poe-trade-form.html", filter )
        .on( "data", function ( data ) {
            generated += data.toString();
        })
        .on( "end", function () {
            cb( generated );
        });
    };

    var addPoeTradeForm = function( filter ) {
        // Add poe.trade form to the page
        if ( filter.links === "0" ) {
            filter.link_min = "0";
            filter.link_max = "4";
        } else if ( filter.links === "45" ) {
            filter.link_min = "0";
            filter.link_max = "5";
        } else if ( filter.links === "any" ) {
            filter.link_min = "";
            filter.link_max = "";
        } else {
            filter.link_min = filter.links;
            filter.link_max = filter.link_min;
        }
        if ( filter.rarity === "0" ) {
            filter.grade = "normal";
        } else if ( filter.rarity === "1" ) {
            filter.grade = "magic";
        } else if ( filter.rarity === "2" ) {
            filter.grade = "rare";
        } else if ( filter.rarity === "3" ) {
            filter.grade = "unique";
        } else if ( filter.rarity === "9" ) {
            filter.grade = "relic";
        } else {
            filter.grade = "any";
        }

        renderPoeTradeForm( filter, function( generated ) {
            $( "#" + filter.id + "-poe-trade-form" ).remove();
            $( "#poe-trade-forms" ).append( generated );
            // Generate form to query poe.trade with mods
            var reg   = /\(([A-Za-z ]+)\).*<span.*>([0-9.…]+)<\/span>\s*\-\s*<span.*>([0-9.…]+)<\/span>/;

            async.eachLimit( filter.modGroups, 1, function( group, cbGroup ) {
                async.eachLimit( Object.keys( group.mods ), 1, function( mod, cbMod ) {
                    var modName = mod;
                    var min = group.mods[mod].min === "…" ? "" : group.mods[mod].min;
                    var max = group.mods[mod].max === "…" ? "" : group.mods[mod].max;
                    var weight = "";
                    if ( group.type === "WEIGHT" ) {
                        weight = group.mods[mod].weight;
                    }
                    modName = modName.replace( /(<span class=\'value\'>[^<>]+<\/span>)/g, "#" )
                                     .replace( "( # - # )", "#" )
                                     .replace( "(Unique explicit)", "" )
                                     .replace( "(Explicit)", "" )
                                     .replace( "Implicit", "implicit" )
                                     .replace( "Enchant", "enchant" )
                                     .replace( "Crafted", "crafted" )
                                     .replace( "(Total)", "(pseudo) (total)" )
                                     .replace( "Pseudo", "pseudo" )
                                     .replace( "Essence", "Explicit" )
                                     .replace( "Talisman implicit", "Implicit" ).trim();
                    $( "#" + filter.id + "-poe-trade-form" ).append(
                        "<select name=\"mod_name\"><option>" + 
                        modName + "</option></select>" +
                        "<input type=\"text\" name=\"mod_min\" value=\"" + min + "\">" +
                        "<input type=\"text\" name=\"mod_max\" value=\"" + max + "\">" +
                        "<input type=\"text\" name=\"mod_weight\" value=\"" + weight + "\">"
                    );
                    
                    cbMod();
                }, function() {
                    var groupMin = group.min === "…" ? "" : group.min;
                    var groupMax = group.max === "…" ? "" : group.max;
                    var type = group.type.toLowerCase();
                    type = type.charAt(0).toUpperCase() + type.slice(1);
                    $( "#" + filter.id + "-poe-trade-form" ).append(
                        "<input type=\"text\" name=\"group_min\" value=\"" + groupMin + "\">" +
                        "<input type=\"text\" name=\"group_max\" value=\"" + groupMax + "\">" +
                        "<input type=\"text\" name=\"group_count\" value=\"" + Object.keys( group.mods ).length + "\">" +
                        "<select name=\"group_type\"><option>" + type + "</option></select>"
                    );
                    cbGroup();
                });
            }, function() {
                // Add corrupted, enchanted ... states
                var option = "<option value=\"\">Either</option>";
                if ( filter.corrupted === "true" ) {
                    option = "<option value=\"1\">Yes</option>";
                } else if ( filter.corrupted === "false" ) {
                    option = "<option value=\"0\">No</option>";
                }
                $( "#" + filter.id + "-poe-trade-form" ).append(
                    "<select name=\"corrupted\">" +
                    option +
                    "</select>"
                );
                option = "<option value=\"\">Either</option>";
                if ( filter.enchanted === "true" ) {
                    option = "<option value=\"1\">Yes</option>";
                } else if ( filter.enchanted === "false" ) {
                    option = "<option value=\"0\">No</option>";
                }
                $( "#" + filter.id + "-poe-trade-form" ).append(
                    "<select name=\"enchanted\">" +
                    option +
                    "</select>"
                );
                option = "<option value=\"\">Either</option>";
                if ( filter.crafted === "true" ) {
                    option = "<option value=\"1\">Yes</option>";
                } else if ( filter.crafted === "false" ) {
                    option = "<option value=\"0\">No</option>";
                }
                $( "#" + filter.id + "-poe-trade-form" ).append(
                    "<select name=\"crafted\">" +
                    option +
                    "</select>"
                );
            });
        });
    };

    var bindFilterToggleState = function( id ) {
        $( "#enable-filter-" + id ).click( function( event ) {
            console.log( "$( \"#enable-filter-" + id + "\" )" );
            event.stopImmediatePropagation();
            filters.toggle( id, function() {
                filters.save();
            });
        });
    };

    var bindGroupToggleState = function( id ) {
        if ( !id ) {
            async.each( groups.groupList, function( group, cbGroup ) {
                $( "#enable-filter-group-" + group.id ).click( function() {
                    groups.toggle( group.id, function() {
                        groups.save();
                        var groupState = $( "#enable-filter-group-" + group.id ).prop( "checked" );
                        // Find all filters in the group and toggle them
                        async.each( filters.filterList, function( filter, cbFilter ) {
                            if ( filter.group === group.id ) {
                                var filterState = $( "#enable-filter-" + filter.id ).prop( "checked" );
                                if ( filterState !== groupState ) {
                                    $( "#enable-filter-" + filter.id ).prop( "checked", groupState );
                                    filters.toggle( filter.id, function() {
                                        filters.save();
                                    });
                                }
                            } else {
                                cbFilter();
                            }
                        }, function() {
                            cbGroup();
                        });
                    });
                });
            });    
        } else {
            console.log( "Binding toggle group" );
            $( "#enable-filter-group-" + id ).unbind();
            $( "#enable-filter-group-" + id ).click( function() {
                groups.toggle( id, function() {
                    groups.save();
                    var groupState = $( "#enable-filter-group-" + id ).prop( "checked" );
                    // Find all filters in the group and toggle them
                    async.each( filters.filterList, function( filter, cbFilter ) {
                        if ( filter.group === id ) {
                            console.log( "Toggling filter " + filter.id + " in group " + id );
                            var filterState = $( "#enable-filter-" + filter.id ).prop( "checked" );
                            if ( filterState !== groupState ) {
                                $( "#enable-filter-" + filter.id ).click();
                            }
                        } else {
                            cbFilter();
                        }
                    }, function() {});
                });
            });
        }
    };

    var enableElements = function( list ) {
        async.each( list.fields, function( element, cbElement ) {
            $( element ).attr( "disabled", false );
            cbElement();
        });
        async.each( list.selects, function( element, cbElement ) {
            $( element ).parent().find( ".select-dropdown" ).attr( "disabled", false );
            cbElement();
        });
    };

    var disableElements = function( list ) {
        async.each( list.fields, function( element, cbElement ) {
            $( element ).attr( "disabled", true );
            cbElement();
        });
        async.each( list.selects, function( element, cbElement ) {
            $( element ).parent().find( ".select-dropdown" ).attr( "disabled", true );
            cbElement();
        });
    };

    // When clicking on a filter group
    var bindFilterGroupEdit = function( id ) {
        $( "#edit-group-" + id ).click( function( e ) {
            e.stopPropagation();
            // console.log( "group: " + id );
            editingGroup = id;
            resetFilters();
            disableElements( elementList );
            $( "#add-filter" ).html( "<i class=\"material-icons\">thumb_up</i><span>Update group</span>" );
            $( "#cancel-filter" ).html( "<i class=\"material-icons\">thumb_down</i><span>Cancel edit</span>" );
            $( "#cancel-filter" ).addClass( "red" ).removeClass( "blue-grey" );
            $( "#add-filter" ).addClass( "green" ).removeClass( "blue-grey" );
            scrollToTopAction(); // Scroll back to top
        });
    };

    var applyGroupEdition = function( id ) {
        var authorizedColumns = [
            "budget",
            "buyout",
            "clipboard",
            "convert",
            "currency",
            "league"
        ];
        fetchFormData( function( data ) {
            // formatFilter( data, function( data ) {
                // Only retain dimensions with non-default values
                var newData = {};
                // delete( data["title"]);
                async.each( Object.keys( data ), function( key, cbKey ) {
                    if ( authorizedColumns.indexOf( key ) !== -1 ) {
                        newData[key] = data[key];
                    }
                    cbKey();
                }, function() {
                    console.log( newData );
                    // Empty group content
                    $( "#filter-group-content-" + id ).empty();
                    // Search for filter within this group
                    async.each( filters.filterList, function( filter, cbFilter ) {
                        if ( filter.group === id ) {
                            // Replace existing dimension with newData values
                            async.each( Object.keys( newData ), function( key, cbKey ) {
                                if ( key === "budget" ) {
                                    if ( newData.budget ) {
                                        // If the price is a percentage
                                        if ( newData.budget.indexOf( "%" ) !== -1 ) {
                                            var currentBudget = parseFloat( filter.budget );
                                            var percentage    = parseFloat( newData.budget.replace( "%", "" ));
                                            filter.budget     = Math.round( currentBudget * percentage ) / 100;
                                        // Otherwise
                                        } else {
                                            filter.budget = Math.round( newData.budget * 100 ) / 100;
                                        }
                                        newData.displayPrice = filter.budget + " " + newData.currency;
                                        filter.displayPrice  = newData.displayPrice;
                                    }
                                    console.log( newData[key] );
                                } else {
                                    filter[key] = newData[key];
                                }
                                cbKey();
                            }, function() {
                                filters.update( filter, function() {
                                    filter.render( function( generated ) {
                                        filters.findFilterIndex( filter, function( res ) {
                                            postRender( filter, generated, res.index );
                                        });
                                    });
                                });
                            });
                        }
                        cbFilter();
                    }, function() {
                        filters.save();
                        $( "#add-filter" ).html( "<i class=\"material-icons\">playlist_add</i><span>Add filter</span>" );
                        $( "#cancel-filter" ).html( "<i class=\"material-icons\">delete</i><span>Clear filter</span>" );
                        $( "#cancel-filter" ).removeClass( "red" );
                        $( "#add-filter" ).removeClass( "green" );
                        editingGroup = "";
                        enableElements( elementList );
                    });
                });
            // });
        });
    };

    // Remove affix from modGroup
    var removeAffix = function( id ) {
        console.log( "Removing " + id );
        async.eachLimit( Object.keys( modGroups ), 1, function( group, cbGroup ) {
            async.eachLimit( Object.keys( modGroups[group].mods ), 1, function( mod, cbMod ) {
                if ( modGroups[group].mods[mod].id === id ) {
                    console.log( "Found mod" );
                    delete modGroups[group].mods[mod];
                } else {
                    console.log( modGroups[group].mods[mod].id );
                }
                cbMod();
            }, function() {
                cbGroup();
            });
        }, function() {
            console.log( modGroups );
        });
    };

    var resetConditionSelector = function() {
        $( "#condition-selector" ).html(
            "<option value=\"and\" selected>AND</option>" + 
            "<option value=\"if\">IF</option>" + 
            "<option value=\"sum\">SUM</option>" + 
            "<option value=\"not\">NOT</option>" + 
            "<option value=\"count\">COUNT</option>" + 
            "<option value=\"weight\">WEIGHT</option>"
        );
        $( "#condition-selector" ).material_select();
    };

    // When clicking on a filter
    var bindFilterEdit = function( id, cb ) {
        $( ".filter-detail#filter-detail-" + id ).click( function( e ) {
            e.stopPropagation();
            scrollToTopAction(); // Scroll back to top
            editingFilter = id;
            // Search for filter with the corresponding id
            async.each( filters.filterList, function( filter, cbFilter ) {
                // if filter matches, load all filter information in the fields
                if ( filter.id === id ) {
                    $( "#league" ).val( filter.league );
                    $( "#league").material_select();
                    $( "#item" ).val( filter.item );
                    $( "#price" ).val( filter.budget );
                    $( "#currency" ).val( Currency.currencyLookupTable[filter.currency]);
                    $( "#currency").material_select();
                    $( "#links" ).val( filter.links );
                    $( "#links").material_select();
                    $( "#sockets-total" ).val( filter.socketsTotal );
                    $( "#sockets-red" ).val( filter.socketsRed );
                    $( "#sockets-green" ).val( filter.socketsGreen );
                    $( "#sockets-blue" ).val( filter.socketsBlue );
                    $( "#sockets-white" ).val( filter.socketsWhite );
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
                    $( "#experience" ).val( filter.experience );
                    $( "#quality" ).val( filter.quality );
                    $( "#rarity" ).val( filter.rarity );
                    $( "#rarity").material_select();
                    $( "#armor" ).val( filter.armor );
                    $( "#es" ).val( filter.es );
                    $( "#evasion" ).val( filter.evasion );
                    $( "#dps" ).val( filter.dps );
                    $( "#pdps" ).val( filter.pdps );
                    $( "#edps" ).val( filter.edps );
                    $( "#price-bo" ).prop( "checked", filter.buyout );
                    $( "#clipboard" ).prop( "checked", filter.clipboard );
                    $( "#convert-currency" ).prop( "checked", filter.convert );
                    $( "#add-filter" ).html( "<i class=\"material-icons\">thumb_up</i><span>Update filter</span>" );
                    $( "#cancel-filter" ).html( "<i class=\"material-icons\">thumb_down</i><span>Cancel edit</span>" );
                    $( "#cancel-filter" ).addClass( "red" ).removeClass( "blue-grey" );
                    $( "#add-filter" ).addClass( "green" ).removeClass( "blue-grey" );
                    $( "#item-type" ).val( filter.itemType );
                    $( "#affixes-list" ).empty();
                    $( "#affix-min" ).val( "" );
                    $( "#affix-max" ).val( "" );
                    $( "#affixes" ).val( "" );
                    $( "#open-prefixes" ).val( filter.openPrefixes );
                    $( "#open-suffixes" ).val( filter.openSuffixes );
                    $( "#map-quantity" ).val( filter.mapQuantity );
                    $( "#map-rarity" ).val( filter.mapRarity );
                    $( "#map-pack-size" ).val( filter.mapPackSize );
                    Materialize.updateTextFields();
                    loadedAffix  = false;
                    editingAffix = "";
                    $( "#add-affix" ).addClass( "disabled" );
                    $( "#cancel-affix" ).addClass( "disabled" );
                    $( "#add-affix" ).text( "Add" );
                    $( "#affixes" ).prop( "disabled", false );

                    modGroups   = filter.modGroups;
                    modGroupsId = {};
                    $( "#conditions" ).empty();
                    var index = 0;
                    resetConditionSelector();
                    async.eachLimit( Object.keys( filter.modGroups ), 1, function( group, cbGroup ) {
                        modGroupsId[group] = filter.modGroups[group].id;
                        var generatedModGroup = "";
                        var obj = {};
                        var parameter = "";
                        if ( filter.modGroups[group].type === "SUM" || 
                             filter.modGroups[group].type === "COUNT" || 
                             filter.modGroups[group].type === "WEIGHT" ) {
                            var groupMinDisp = filter.modGroups[group].min !== "" ? filter.modGroups[group].min : "…";
                            var groupMaxDisp = filter.modGroups[group].max !== "" ? filter.modGroups[group].max : "…";
                            parameter    = "( " + groupMinDisp + " - " + groupMaxDisp + " )";
                            index++;
                            obj = {
                                "id":        filter.modGroups[group].id,
                                "type":      filter.modGroups[group].type,
                                "index":     "[" + index + "]",
                                "parameter": parameter
                            };
                            var ref = "[" + index + "]";
                            // Add options to select
                            $( "#condition-selector" ).append(
                                "<option value=\"" + group + "\">" + filter.modGroups[group].type + " " + ref + "</option>"
                            );
                            $( "#condition-selector" ).material_select();
                        } else {
                            obj = {
                                "id":        filter.modGroups[group].id,
                                "type":      filter.modGroups[group].type,
                                "index":     "",
                            };
                        }   
                        
                        mu.compileAndRender( "condition.html", obj )
                        .on( "data", function ( data ) {
                            generatedModGroup += data.toString();
                        })
                        .on( "end", function () {
                            // console.log( "Modified: " + generated );
                            $( "#conditions" ).append( generatedModGroup );
                        });
                        async.eachLimit( Object.keys( filter.modGroups[group].mods ), 1, function( mod, cbMod ) {
                            var weight = "";
                            if ( filter.modGroups[group].type === "WEIGHT" ) {
                                weight = "Weight: " + filter.modGroups[group].mods[mod].weight;
                            }
                            var generated = "";
                            // Find out the mod type (explicit, implicit, etc.)
                            var extractReg = /^\(([a-zA-Z ]+)\)\s*/;
                            var sharpReg   = /#/;
                            var match      = extractReg.exec( mod );
                            var matched;
                            if ( !match ) {
                                matched = "Explicit";
                            } else {
                                matched = match[1];
                            }
                            var displayMin = "<span class='value'>" + filter.modGroups[group].mods[mod].min + "</span>";
                            var displayMax = "<span class='value'>" + filter.modGroups[group].mods[mod].max + "</span>";
                            var title = mod;
                            var count = ( title.match( /#/g ) || []).length;
                            if ( count > 1 ) {
                                title = title.replace( "#", displayMin );
                                title = title.replace( "#", displayMax );
                            } else {
                                title = mod.replace( 
                                    "#", "( " + displayMin + " - " + 
                                                displayMax + " )" );
                            }
                            
                            var obj = {
                                "title":  mod,
                                "min":    displayMin,
                                "max":    displayMax,
                                "affix":  title.replace( /^\([a-zA-Z ]+\)\s*/, "<span class='badge affix-" + matched.toLowerCase() +  "' data-badge-caption='" + matched + "'></span>" ),
                                "id":     filter.modGroups[group].mods[mod].id,
                                "typeLC": matched.toLowerCase(),
                                "type":   matched,
                                "weight": weight
                            };
                            mu.compileAndRender( "affix.html", obj )
                            .on( "data", function ( data ) {
                                generated += data.toString();
                            })
                            .on( "end", function () {
                                // console.log( "Modified: " + generated );
                                $( "#condition-container-" + filter.modGroups[group].id ).append( generated );
                                $( "#" + obj.id ).data( "data-item", obj );
                                // When clicking on remove affix
                                $( ".remove-affix" ).click( function() {
                                    var id = $( this ).attr( "id" ).replace( "remove-affix-", "" );
                                    $( this ).parent().parent().remove();
                                    removeAffix( id );
                                });
                                bindAffixEdition( obj.id );
                                bindAffixHover( obj.id );
                                cbMod();
                            });
                        }, function() {
                            cbGroup();
                        });
                    }, function() {
                        cbFilter();
                    });
                } else {
                    cbFilter();
                }
            }, function( err ) {
                if ( err ) {
                    console.log( err );
                }
                cb();
            });
        });
    };

    var poeTradeStats = function( filters ) {
        // console.log( filters );
        if ( !config.usePoeTradeStats ) {
            $( ".item-stats" ).hide();
            return;
        } else {
            $( ".item-stats" ).show();
        }
        // var reg = /\(\s*([^ ]*)\s*\-\s*([^ ]*)\s*\)/;
        console.log( "Refreshing poe.trade stats" );
        async.each( filters, function( filter, cbFilter ) {
            // console.log( "Updating poe.trade stats for filter " + filter.id );
            var str = "";
            if ( filter.links === "0" ) {
                filter.link_min = "0";
                filter.link_max = "4";
            } else if ( filter.links === "45" ) {
                filter.link_min = "0";
                filter.link_max = "5";
            } else if ( filter.links === "any" ) {
                filter.link_min = "";
                filter.link_max = "";
            } else {
                filter.link_min = filter.links;
                filter.link_max = filter.link_min;
            }
            if ( filter.rarity === "0" ) {
                filter.grade = "normal";
            } else if ( filter.rarity === "1" ) {
                filter.grade = "magic";
            } else if ( filter.rarity === "2" ) {
                filter.grade = "rare";
            } else if ( filter.rarity === "3" ) {
                filter.grade = "unique";
            } else if ( filter.rarity === "9" ) {
                filter.grade = "relic";
            } else {
                filter.grade = "any";
            }
            var corrupted = filter.corrupted;
            if ( corrupted === "any" ) {
                corrupted = "";
            } else {
                corrupted = filter.corrupted === "True" ? "1" : "0";
            }
            var enchanted = filter.enchanted;
            if ( enchanted === "any" ) {
                enchanted = "";
            } else {
                enchanted = filter.enchanted  === "True" ? "1" : "0";
            }
            var crafted = filter.crafted;
            if ( crafted === "any" ) {
                crafted = "";
            } else {
                crafted = filter.crafted  === "True" ? "1" : "0";
            }
            var itemType = filter.itemType;
            if ( filter.itemType === "any" ) {
                itemType = "";
            } else {
                itemType = matchPoeTradeTypeWithInternal( filter.itemType );
            }
            var data = $.param({
                name:        filter.item,
                league:      filter.league,
                type:        itemType,
                sockets_min: filter.socketsTotal,
                sockets_r:   filter.socketsRed,
                sockets_g:   filter.socketsGreen,
                sockets_b:   filter.socketsBlue,
                sockets_w:   filter.socketsWhite,
                link_min:    filter.link_min,
                link_max:    filter.link_max,
                q_min:       filter.quality,
                ilvl_min:    filter.level,
                level_min:   filter.tier,
                corrupted:   corrupted,
                enchanted:   enchanted,
                crafted:     crafted,
                armour_min:  filter.armor,
                evasion_min: filter.evasion,
                shield_min:  filter.es,
                rarity:      filter.grade
            }, true );
            // Add mods
            var reg   = /\(([A-Za-z ]+)\).*<span.*>([0-9.…]+)<\/span>\s*\-\s*<span.*>([0-9.…]+)<\/span>/;
            async.eachLimit( filter.modGroups, 1, function( group, cbGroup ) {
                async.eachLimit( Object.keys( group.mods ), 1, function( mod, cbMod ) {
                    var modName = mod;
                    var min = group.mods[mod].min === "…" ? "" : group.mods[mod].min;
                    var max = group.mods[mod].max === "…" ? "" : group.mods[mod].max;
                    var weight = "";
                    if ( group.type === "WEIGHT" ) {
                        weight = group.mods[mod].weight;
                    }
                    modName = modName.replace( /(<span class=\'value\'>[^<>]+<\/span>)/g, "#" )
                                     .replace( "( # - # )", "#" )
                                     .replace( "(Unique explicit)", "" )
                                     .replace( "(Explicit)", "" )
                                     .replace( "Implicit", "implicit" )
                                     .replace( "Enchant", "enchant" )
                                     .replace( "Crafted", "crafted" )
                                     .replace( "(Total)", "(pseudo) (total)" )
                                     .replace( "Pseudo", "pseudo" )
                                     .replace( "Essence", "Explicit" )
                                     .replace( "Talisman implicit", "Implicit" ).trim();
                    data += "&" + $.param({
                        mod_name:   modName,
                        mod_min:    min,
                        mod_max:    max,
                        mod_weight: weight
                    }, true );
                    cbMod();
                }, function() {
                    var groupMin = group.min === "…" ? "" : group.min;
                    var groupMax = group.max === "…" ? "" : group.max;
                    var type = group.type.toLowerCase();
                    type = type.charAt(0).toUpperCase() + type.slice(1);
                    data += "&" + $.param({
                        group_type:  type,
                        group_min:   groupMin,
                        group_max:   groupMax,
                        group_count: Object.keys( group.mods ).length,
                    }, true );
                    cbGroup();
                });
            }, function() {
                data += "&" + $.param({
                    online:     "x",
                    has_buyout: "1"
                }, true );
                // console.log( data );
                $.post( "http://poe.trade/search", data, function( data ) {
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
                    str += "<span>Poe.trade stats based on <b>" + prices.length + "</b> items</span>";
                    // console.log( priceCount );
                    for ( var p in priceCount ) {
                        if ( priceCount.hasOwnProperty( p ) && priceCount[p] > 1 && p !== "" ) {
                            str += "<span>" + p + ": <b>" + priceCount[p] + "</b></span>";
                        }
                    }
                    $( "#filter-detail-" + filter.id + " .item-stats" ).html(
                        str
                    );
                    cbFilter();
                });
            });
        });
    };

    loadFilterGroups( function() {
        loadFilters( function() {
            bindGroupToggleState( null );
        });
    });
    
    setInterval( poeTradeStats, config.POE_TRADE_STATS_INTERVAL, filters.filterList );

    // When clicking on 'Snipe', download change_ids and filter them
    $( "#snipe" ).click( function() {
        if ( !downloading ) {
            downloading = true;
            interrupt   = false;
            $( ".progress" ).fadeIn();
            $( "#snipe" ).html( "<i class=\"material-icons\">pause</i><span>Stop</span>" );
            Chunk.getLastChangeId( function( entry ) {
                downloadChunk( entry, downloadChunk );
            });
        } else {
            downloading = false;
            interrupt   = true;
            delayQueue  = [];
            $( ".progress" ).fadeOut();
            $( "#snipe" ).html( "<i class=\"material-icons\">play_arrow</i><span>Snipe</span>" );
        }
    });

    var updateResultsAmount = function() {
        $( "#results-amount" ).text( $( ".entry:visible" ).length );
    };

    // When clicking on share entries icon
    // $( "#share-entries" ).click( function() {
    //     fs.writeFile( __dirname + "/export.json", JSON.stringify( results ), function( err ) {
    //         if ( err ) {
    //             console.log( err );
    //         }
    //     });
    // });

    // When clicking on clear entries icon
    $( "#clear-entries" ).click( function() {
        $( "#results ul" ).empty();
        results     = {};
        resultsId   = {};
        prices      = {};
        entryLookup = {};
        delayQueue  = [];
        updateResultsAmount();
    });

    // When clicking on an entry result, copy a whisper message to clipboard
    var bindClickEntry = function( id ) {
        $( "#" + id ).click( function() {
            var data = $( this ).data( "item" );
            // var str = "@" + data.accountName + " Hi " + data.accountName + ", I would like to buy your '" + data.name + "' in " + data.league + " for " + data.price + " in stash '" + data.stashName + "'. Is it still available? :)";
            Misc.formatMessage( data, function( str ) {
                ncp.copy( str, function() {
                    console.log( data );
                    if ( config.visualNotification ) {
                        notifier.notify({
                            'title': 'Message copied to clipboard',
                            'message': str,
                        });
                    }
                });
            });
        });
    };

    // When clicking on blacklist button
    var bindBlacklistEntry = function( id ) {
        $( "#blacklist-action-" + id ).click( function( e ) {
            e.stopPropagation();
            console.log( "Clicked blacklist" );
            $( "#blacklist-modal" ).modal( "open" );
            $( "#blacklist-reason" ).val( "" );
            var entry = results[id];
            $( ".modal-content .blacklist-account" ).text( entry.accountName );
            $( "#blacklist" ).click( function() {
                var reason = $( "#blacklist-reason" ).val();
                playerBlackList.add({
                    factor: entry.accountName,
                    reason: reason,
                    active: true
                });
                playerBlackList.save();
            });
        });
    };

    // When clicking on 'cancel affix'
    $( "#cancel-affix" ).click( function() {
        $( "#affix-min" ).val( "" );
        $( "#affix-max" ).val( "" );
        $( "#affix-weight" ).val( "" );
        $( "#mod-group-min" ).val( "" );
        $( "#mod-group-max" ).val( "" );
        $( "#affixes" ).val( "" );
        $( "#condition-selector" ).val( "and" );
        $( "#condition-selector" ).material_select();
        Materialize.updateTextFields();
        $( "#add-affix" ).addClass( "disabled" );
        $( "#cancel-affix" ).addClass( "disabled" );
        $( "#add-affix" ).text( "Add" );
        $( "#affixes" ).prop( "disabled", false );
        loadedAffix = false;
    });
    
    // When clicking on 'add affix'
    $( "#add-affix" ).click( function() {
        var addAffix = function( operator, operatorRef ) {
            var affix = $( "#affixes" ).val();
            console.log( affix );
            console.log( operator );
            if ( affix !== "" ) {
                var min = $( "#affix-min" ).val();
                min = min === "" ? "…" : min;
                var minVal = min;
                min = "<span class='value'>" + min + "</span>";
                var max = $( "#affix-max" ).val();
                max = max === "" ? "…" : max;
                var maxVal = max;
                max = "<span class='value'>" + max + "</span>";
                var modId = Misc.guidGenerator();
                modGroups[operatorRef].mods[affix] = {
                    "min": minVal,
                    "max": maxVal,
                    "id": modId
                };
                if ( operator.indexOf( "weight" ) !== -1 ) {
                    modGroups[operatorRef].mods[affix].weight = $( "#affix-weight" ).val();
                }
                console.log( modGroups );
                console.log( modGroupsId );
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
                    id:    modId
                };
    
                if ( operator.indexOf( "weight" ) !== -1 ) {
                    obj.weight = "Weight: " + $( "#affix-weight" ).val();
                }
    
                // Editing existing affix
                if ( $( "#add-affix" ).text() !== "Add" ) {
                    console.log( "Editing affix " + editingAffix );
                    obj.id = editingAffix;
                    editingAffix = "";
                }
                var generated = "";
                mu.compileAndRender( "affix.html", obj )
                .on( "data", function ( data ) {
                    generated += data.toString();
                })
                .on( "end", function () {
                    var affixListElement = $( "#conditions #" + obj.id );
                    if ( affixListElement.length > 0 ) {
                        affixListElement.parent().replaceWith( generated );
                    } else {
                        $( "#condition-container-" + condition.id ).append( generated );
                    }
                    var extractReg = /^\(([a-zA-Z ]+)\)\s*/;
                    var match      = extractReg.exec( obj.affix );
                    var type;
                    if ( match ) {
                        $( "#" + obj.id ).html( obj.affix.replace( /^\([a-zA-Z ]+\)\s*/, "" ));
                        type = match[1];
                    } else {
                        type = "Explicit";
                    }
                    $( "#" + obj.id ).prepend( 
                        "<span class='badge affix-" + type.toLowerCase() + 
                        "' data-badge-caption='" + type + "'></span>" 
                    );
    
                    $( "#" + obj.id ).data( "data-item", obj );
                    // When clicking on remove affix
                    $( ".remove-affix" ).click( function() {
                        var id = $( this ).attr( "id" ).replace( "remove-affix-", "" );
                        $( this ).parent().parent().remove();
                        removeAffix( id );
                    });
                    bindAffixEdition( obj.id );
                    bindAffixHover( obj.id );
                    $( "#affix-weight" ).val( "" );
                    $( "#mod-group-min" ).val( "" );
                    $( "#mod-group-max" ).val( "" );
                    $( "#condition-selector" ).val( "and" );
                    $( "#condition-selector" ).material_select();
                    $( "#affix-min" ).val( "" );
                    $( "#affix-max" ).val( "" );
                    $( "#affixes" ).val( "" );
                    Materialize.updateTextFields();
                    $( "#add-affix" ).addClass( "disabled" );
                    $( "#cancel-affix" ).addClass( "disabled" );
                    $( "#affixes" ).prop( "disabled", false );
                });
            }
        };

        loadedAffix = false;
        var operatorList = [
            "and", "if", "sum", "not", "count", "weight"
        ];
        var operator = $( "#condition-selector" ).val();
        var operatorRef;
        var index;
        var createModGroup = false;
        
        // It makes no difference having several "and" or "not" groups
        if ( operator !== "and" && operator !== "not" && operator !== "if" ) {
            index = "[" + Object.keys(modGroupsId).length + "]";
            // There is an existing modgroup
            operatorRef = operator + ( Object.keys(modGroupsId).length );
            console.log( modGroupsId );
            console.log( operator );
            console.log( operatorRef );
            if ( modGroupsId[operator]) {
                console.log( "There is an existing mod-group with id: " + modGroupsId[operator]);
                operatorRef = operator;
            } else if ( modGroupsId[operatorRef]) {
                console.log( "There is an existing mod-group with id: " + modGroupsId[operatorRef]);
            } else {
                console.log( "No existing mod-group, creating new one" );
                createModGroup = true;
                modGroupsId[operatorRef] = Misc.guidGenerator();
                // Add option to select
                $( "#condition-selector" ).append(
                    "<option value=\"" + operatorRef + "\">" + operator.toUpperCase() + " " + index + "</option>"
                );
                $( "#condition-selector" ).material_select();
            }
        } else {
            operatorRef = operator;
            index = "";
            console.log( "Using generic mod-group" );
            if ( !modGroupsId[operatorRef]) {
                createModGroup = true;
                modGroupsId[operatorRef] = Misc.guidGenerator();
            }
        }
        if ( !modGroups[operatorRef]) {
            modGroups[operatorRef] = {
                "id": modGroupsId[operatorRef],
                "type": operator.toUpperCase(),
                "mods": {}
            };
        }

        var parameter = "";
        if ( operator.indexOf( "sum" ) !== -1 || 
             operator.indexOf( "count" ) !== -1 || 
             operator.indexOf( "weight" ) !== -1 ) {
            modGroups[operatorRef].min = $( "#mod-group-min" ).val();
            modGroups[operatorRef].max = $( "#mod-group-max" ).val();
            var groupMinDisp = modGroups[operatorRef].min !== "" ? modGroups[operatorRef].min : "…";
            var groupMaxDisp = modGroups[operatorRef].max !== "" ? modGroups[operatorRef].max : "…";
            parameter    = "( " + groupMinDisp + " - " + groupMaxDisp + " )";
        }
        
        console.log( modGroupsId );
        var condition = {
            "id":   modGroupsId[operatorRef],
            "type": operator.toUpperCase(),
            "index": index,
            "parameter": parameter
        };
        console.log( modGroups );
        if ( createModGroup ) {
            console.log( "Creating mod group" );
            var generatedCond = "";
            mu.compileAndRender( "condition.html", condition )
            .on( "data", function ( data ) {
                generatedCond += data.toString();
            })
            .on( "end", function () {
                $( "#conditions" ).append( generatedCond );
                addAffix( operator, operatorRef );
            });
        } else {
            console.log( "Not creating mod group" );
            $( "#condition-parameter-" + condition.id ).html( parameter );
            addAffix( operator, operatorRef );
        }
    });

    /**
     * Send notification and format message
     *
     * @params Item
     * @return Nothing
     */
    var notifyNewItem = function( item ) {
        displayingNotification = true;
        // If audio notifications are activated
        if ( config.audioNotification ) {
            audio.volume           = config.volume;
            audio.play();
        }
        // If visual notifications are activated
        if ( config.visualNotification ) {
            var displayName        = item.name;
            if ( item.typeLine !== item.name && ( item.frameType > 0 && item.frameType < 4 )) {
                displayName += " (" + item.typeLine + ")";
            }

            notifier.notify({
                title:   displayName,
                message: "Price: " + item.displayPrice,
                wait:    true
            }, function ( err ) {
                if ( err ) {
                    // console.log( err );
                }
                displayingNotification = false;
            });
        }

        // If copy to clipboard enabled, do it
        if ( item.clipboard || $( "#global-clipboard" ).prop( "checked" )) {
            Misc.formatMessage( item, function( str ) {
                ncp.copy( str, function() {
                });
            });
        }
    };

    var renderSockets = function( item ) {
        var rsc = {
            "D": "./media/socket_dex.png",
            "S": "./media/socket_str.png",
            "I": "./media/socket_int.png",
            "G": "./media/socket_white.png"
        };
        var currentGroup = -1;
        var lastGroup    = -1;
        var socketIndex  = 0;
        async.each( item.sockets, function( socket, cbSocket ) {
            socketIndex++;
            currentGroup = socket.group;
            // Change image resource associated to socket type and reveal
            $( "li#" + item.id + " .socket" + socketIndex ).attr( "src", rsc[socket.attr]).show();
            // If we are still in the same group, draw a link
            if ( currentGroup === lastGroup && socketIndex > 1 ) {
                $( "li#" + item.id + " .link" + ( socketIndex - 1 )).show();
            }
            lastGroup = socket.group;
        });
    };

    var displayItem = function( item, stash, foundIndex, clipboard, filterId, callback ) {
        if ( item.blacklisted ) {
            console.log( "Hiding blacklisted player: " + item.blacklisted );
            callback();
        } else {
            var generated = "";
            var displayItem = JSON.parse( JSON.stringify( item ));
            mu.compileAndRender( "entry.html", displayItem )
            .on( "data", function ( data ) {
                generated += data.toString();
            })
            .on( "end", function () {
                $( "#results ul" ).prepend( generated );
                if ( displayItem.fullPrice ) {
                    displayItem.originalPrice += "<span class=\"" + displayItem.confidence + "\"> (" + displayItem.fullPrice + " chaos)</span> " + Math.round(( 1 - displayItem.price / displayItem.fullPrice ) * 100 ) + "% off" ;
                    $( "#" + item.id + " .currency" ).html( displayItem.originalPrice );
                }
                updateResultsAmount();
                item.accountName = stash.lastCharacterName;
                item.name = item.item;
                var element = $( "#" + item.id );
    
                // Tag item with filter id
                element.data( "tag", filterId );
                
                // item.price = price;
                item.stashName = stash.stash;
                element.data( "item", item );
                // Add proper coloring
                if ( item.frameType === 1 ) {
                    $( "#" + item.id + " .item" ).addClass( "magic" );
                } else if ( item.frameType === 2 ) {
                    $( "#" + item.id + " .item" ).addClass( "rare" );
                } else if ( item.frameType === 3 ) {
                    $( "#" + item.id + " .item" ).addClass( "unique" );
                } else if ( item.frameType === 4 ) {
                    $( "#" + item.id + " .item" ).addClass( "gem" );
                } else if ( item.frameType === 5 ) {
                    $( "#" + item.id + " .item" ).addClass( "currency" );
                } else if ( item.frameType === 6 ) {
                    $( "#" + item.id + " .item" ).addClass( "divination" );
                } else if ( item.frameType === 8 ) {
                    $( "#" + item.id + " .item" ).addClass( "prophecy" );
                } else if ( item.frameType === 9 ) {
                    $( "#" + item.id + " .item" ).addClass( "legacy" );
                } 
                bindClickEntry( item.id );
                bindBlacklistEntry( item.id );
                $( "#" + item.id + " .implicit-container" ).html( item.implicit );
                $( "#" + item.id + " .enchant-container" ).html( item.enchant );
                $( "#" + item.id + " .explicit-container" ).html( item.explicit );
                $( "#" + item.id + " .crafted-container" ).html( item.crafted );
                $( "#" + item.id + " .total-container" ).html( item.total );
                $( "#" + item.id + " .pseudo-container" ).html( item.pseudo );
                if ( item.implicit === "" ) {
                    $( "#" + item.id + " .implicit-container" ).hide();
                }
                if ( item.enchant === "" ) {
                    $( "#" + item.id + " .enchant-container" ).hide();
                }
                if ( item.crafted === "" ) {
                    $( "#" + item.id + " .crafted-container" ).hide();
                }
                if ( !item.corrupted ) {
                    $( "#" + item.id + " .corrupted" ).hide();
                }
                $( "#" + item.id + " .properties-container" ).html( item.properties );
    
                item.displayPrice = item.originalPrice;
                if ( item.displayPrice === "Negotiate price" ) {
                    item.displayPrice = "barter";
                }
    
                renderSockets( item );
    
                // Only notify if the item is new in the list
                // or if it's been repriced lower
                if ( foundIndex === -1 || item.originalPrice < prices[item.itemId]) {
                    // Update stored price
                    prices[item.itemId] = item.originalPrice;
                    item.clipboard = clipboard;
                    lastItem       = item;
                    // If delay queue is empty an no notification is being displayed, notify now
                    // Otherwise, put in the queue
                    if ( delayQueue.length === 0 && !displayingNotification ) {
                        notifyNewItem( item );
                    } else {
                        delayQueue.push( item );
                    }
                }
                callback();
            });
        }
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

        var begin = Date.now();

        var split = chunkID.split( "-" );
        $( "#current-change-id" ).text( split[0]);

        var parseData = function( data ) {
            // Store last chunk ID
            console.time( "Total search time" );
            // If using underpriced mode
            if ( config.checkUnderpriced ) {
                var minPrice = $( "#underpriced-min-price" ).val();
                var maxPrice = $( "#underpriced-max-price" ).val();
                // If min or max price are not set, min = 0 and max = 100000
                minPrice = minPrice === "" ? 0 : minPrice;
                maxPrice = maxPrice === "" ? 100000 : maxPrice;
                async.each( data.stashes, function( stash, callbackStash ) {
                    async.each( stash.items, function( item, callbackItem ) {
                        item.stashTab          = stash.stash;
                        item.lastCharacterName = stash.lastCharacterName;
                        item.accountName       = stash.accountName;
                        var underpricedPercentage = $( "#underpriced-percentage" ).val();
                        var underpricedMetric     = $( "#underpriced-metric" ).val();
                        var underpricedLeague     = $( "#underpriced-league" ).val();
                        Item.checkUnderpriced( 
                            item, minPrice, maxPrice, currencyRates, itemRates, underpricedPercentage, 
                            underpricedMetric, underpricedLeague, function( item ) {
                            if ( item ) {
                                if ( !itemInStash[stash.id]) {
                                    itemInStash[stash.id] = {
                                        previousItems: {},
                                        items:         {}
                                    };
                                }
                                itemInStash[stash.id].items[item.itemId] = item.id;
                                // If item has already been added
                                var foundIndex = -1;
                                if( resultsId[item.itemId]) {
                                    item.id = entryLookup[item.itemId];
                                    console.log( "Selecting: " + $( "li#" + entryLookup[item.itemId]).length );
                                    $( "li#" + entryLookup[item.itemId]).addClass( "old" );
                                    foundIndex = 1;
                                    results[entryLookup[item.itemId]] = item;
                                } else {
                                    resultsId[item.itemId] = true;
                                    entryLookup[item.itemId] = item.id;
                                    results[item.id] = item;
                                }
                                displayItem( item, stash, foundIndex, false, "", function() {
                                    callbackItem();
                                });
                            } else {
                                callbackItem();
                            }
                        });
                    }, function() {
                        callbackStash();
                    });
                }, function() {
                    // Remove sold/displaced items
                    async.each( data.stashes, function( stash, cbStash ) {
                        if ( itemInStash[stash.id] ) {
                            async.each( Object.keys( itemInStash[stash.id].previousItems ), function( previousItem, cbPreviousItem ) {
                                if ( !itemInStash[stash.id].items[previousItem]) {
                                    console.log( previousItem + " was sold" );
                                    sold++;
                                    $( "li#" + entryLookup[previousItem] ).addClass( "sold" );
                                    delete results[entryLookup[previousItem]];
                                    delete prices[previousItem];
                                    delete resultsId[previousItem];
                                    delete entryLookup[previousItem];
                                }
                                cbPreviousItem();
                            }, function( err ) {
                                itemInStash[stash.id].previousItems = JSON.parse( JSON.stringify( itemInStash[stash.id].items ));
                                itemInStash[stash.id].items         = {};
                                cbStash();
                            });
                        } else {
                            cbStash();
                        }
                    }, function( err ) {
                        if ( err ) {
                            console.log( err );
                        }
                        console.timeEnd( "Total search time" );
                        done( data );
                    });
                });
            // If using filter mode
            } else {
                var totalTime = 0;
                var groupTimes = {};
                async.each( filters.filterList, function( filter, callbackFilter ) {
                    if ( !filter.active ) {
                        callbackFilter();
                    } else {
                        // For each stashes in the new data file
                        var totalItems = 0;
                        // console.time( "Checking filter: " + filter.id );
                        var beginFilter = Date.now();
                        async.each( data.stashes, function( stash, callbackStash ) {
                            totalItems += stash.items.length;
                            async.each( stash.items, function( item, callbackItem ) {
                                item.stashTab          = stash.stash;
                                item.lastCharacterName = stash.lastCharacterName;
                                item.accountName       = stash.accountName;
                                filter.check( item, currencyRates, function( item ) {
                                    if ( item ) {
                                        if ( !itemInStash[stash.id]) {
                                            itemInStash[stash.id] = {
                                                previousItems: {},
                                                items:         {}
                                            };
                                        }
                                        itemInStash[stash.id].items[item.itemId] = item.id;
                                        // If item has already been added
                                        var foundIndex = -1;
                                        if( resultsId[item.itemId]) {
                                            item.id = entryLookup[item.itemId];
                                            $( "li#" + entryLookup[item.itemId]).addClass( "old" );
                                            foundIndex = 1;
                                            results[entryLookup[item.itemId]] = item;
                                            // console.log( item.id + ":" + entryLookup[item.itemId] + " already added" );
                                            // console.log( JSON.stringify( resultsId ));
                                            // console.log( JSON.stringify( entryLookup ));
                                        } else {
                                            // console.log( "Found new id " + item.itemId );
                                            resultsId[item.itemId] = true;
                                            entryLookup[item.itemId] = item.id;
                                            results[item.id] = item;
                                            // console.log( "Adding " + item.id  + ":" + entryLookup[item.itemId]);
                                        }
                                        if ( playerBlackList.check( stash.lastCharacterName ) ||
                                             playerBlackList.check( stash.accountName )) {
                                            item.blacklisted = stash.accountName;
                                        }
                                        displayItem( item, stash, foundIndex, filter.clipboard, filter.id, function() {
                                            callbackItem();
                                        });
                                    } else {
                                        callbackItem();
                                    }
                                });
                            }, function( err ) {
                                if ( err ) {
                                    console.log( err );
                                }
                                callbackStash();
                                // console.log( "Done with item" );
                            });
                        }, function( err ) {
                            if ( err ) {
                                console.log( err );
                            }
                            // console.log( "Checked " + totalItems + " items" );
                            // console.timeEnd( "Checking filter: " + filter.id );
                            // If we're monitoring processing time, compute and display it
                            if ( config.showFilterProcessingTime ) {
                                var time = Date.now() - beginFilter;
                                totalTime += time;
                                var element = $( "#filter-detail-" + filter.id + " .performance-info-time" );
                                element.text( time + " ms" );
                                var groupId = $( "#filter-detail-" + filter.id ).parents( ".filter-detail-group" ).attr( "id" );
                                if ( groupId ) {
                                    if ( filter.group !== "" && !groupTimes[groupId]) {
                                        groupTimes[groupId] = 0;
                                    }
                                    groupTimes[groupId] += time;
                                }
                                // Print text in red if above 100ms
                                if ( time > 100 ) {
                                    element.addClass( "red-text" );
                                } else {
                                    element.removeClass( "red-text" );
                                }
                            }
                            callbackFilter();
                        });
                    }
                }, function( err ) {
                    async.each( Object.keys( groupTimes ), function( group, cbGroup ) {
                        var time = groupTimes[group];
                        var element = $( "#" + group + " .performance-info-time-group" );
                        element.text( time + " ms" );
                        // Print text in red if above 100ms
                        if ( time > 100 ) {
                            element.addClass( "red-text" );
                        } else {
                            element.removeClass( "red-text" );
                        }
                        cbGroup();
                    });
                    if ( err ) {
                        console.log( err );
                    }
                    // If we're monitoring processing time, display total time
                    if ( config.showFilterProcessingTime ) {
                        $( "#total-processing-time" ).text( totalTime + " ms" );
                    }

                    // Remove sold/displaced items
                    console.time( "Removing sold/displaced" );
                    async.each( data.stashes, function( stash, cbStash ) {
                        if ( itemInStash[stash.id] ) {
                            async.each( Object.keys( itemInStash[stash.id].previousItems ), function( previousItem, cbPreviousItem ) {
                                if ( !itemInStash[stash.id].items[previousItem]) {
                                    // console.log( previousItem + " was sold" );
                                    sold++;
                                    $( "li#" + itemInStash[stash.id].previousItems[previousItem] ).addClass( "sold" );
                                    // console.log( "li#" + itemInStash[stash.id].previousItems[previousItem] );
                                    delete results[itemInStash[stash.id].previousItems[previousItem]];
                                    delete prices[previousItem];
                                    delete resultsId[previousItem];
                                }
                                cbPreviousItem();
                            }, function( err ) {
                                itemInStash[stash.id].previousItems = JSON.parse( JSON.stringify( itemInStash[stash.id].items ));
                                itemInStash[stash.id].items         = {};
                                cbStash();
                            });
                        } else {
                            cbStash();
                        }
                    }, function( err ) {
                        if ( err ) {
                            console.log( err );
                        }
                        console.timeEnd( "Removing sold/displaced" );
                        console.timeEnd( "Total search time" );
                        done( data );
                    });
                });
            }
        };

        Chunk.download( chunkID, parseData );

        var done = function( data ) {

            // console.log( "resultsId: " + Object.keys( resultsId ).length );
            // console.log( "results: " + Object.keys( results ).length );
            // console.log( "prices: " + Object.keys( prices ).length );
            // console.log( "entryLookup: " + Object.keys( entryLookup ).length );
            // console.log( "sold: " + sold );

            removeEntriesAboveLimit( config.maxEntryAmount );
            filterResultListAction();
            var nextID = data.next_change_id;
            var end = Date.now();
            var waitInterval = config.CHUNK_DOWNLOAD_INTERVAL - ( end - begin );
            waitInterval     = waitInterval < 0 ? 0 : waitInterval;
            console.log( "Waiting " + waitInterval + " ms" );

            if ( interrupt ) {
                console.log( "Stopped sniper" );
                // Stop notifications when not sniping
                delayQueue  = [];
            } else {
                if ( !interrupt ) {
                    setTimeout( callback, waitInterval, nextID, callback );
                    // callback( nextID, callback );
                }
            }
        };
    };

    var removeEntriesAboveLimit = function( limit ) {
        while ( $( "div#results .entry" ).length > limit ) {
            var entry    = $( "div#results" ).find( ".entry:last-child" );
            var data     = entry.data( "item" );
            var itemId   = data.itemId;
            var visualId = data.id;
            // console.log( "Removing " + visualId  + ":" + entryLookup[itemId]);
            if ( !results[visualId] ) {
                console.log( "results: Item does not exist" );
            }
            delete results[visualId];
            if ( !resultsId[itemId] ) {
                console.log( "resultsId: Item does not exist" );
            }
            delete resultsId[itemId];
            if ( !prices[itemId] ) {
                console.log( "prices: Item does not exist" );
            }
            delete prices[itemId];
            if ( !entryLookup[itemId] ) {
                console.log( "entryLookup: Item does not exist" );
            }
            delete entryLookup[itemId];
            entry.remove();
        }
        // console.log( JSON.stringify( results ));
    };

    // View setup
    // ------------------------------------------------------------------------
    $( 'select' ).material_select(); // Generate selects
    setupAutocomplete();             // Setup autocompletion

    // Fetch active leagues and save them to the config file
    Misc.getLeagues( function( leagues ) {
        console.log( leagues );
        config.leagues = leagues;
        saveConfig();
        // Fetch new rates now and setup to be fetched every 10 seconds
        Currency.getLastRates( function( rates ) {
            for ( var league in rates ) {
                if ( rates.hasOwnProperty( league )) {
                    currencyRates[league] = rates[league];
                }
            }
            console.log( currencyRates );
        });
        setInterval( Currency.getLastRates, config.RATES_REFRESH_INTERVAL, function( rates ) {
            for ( var league in rates ) {
                if ( rates.hasOwnProperty( league )) {
                    currencyRates[league] = rates[league];
                }
            }
            // console.log( currencyRates );
        });

        // Fetch new item rates and setup to be fetched every 30 min
        Item.getLastRates( function( rates ) {
            itemRates = rates;
            // console.log( itemRates );
        });
        setInterval( Item.getLastRates, 30 * 60 * 1000, function( rates ) {
            // console.log( rates );
            currencyRates = rates;
        });
    });

    // If user decided not to show status bar, hide it
    if ( !config.showStatusBar ) {
        $( "#status-bar" ).hide();
    }

    // Check for update on startup
    Misc.checkUpdate( function( data ) {
        // If there is an update
        if ( data ) {
            // Blur everything
            $( ".filter-form" ).addClass( "blurred" );
            $( ".filter-interaction" ).addClass( "blurred" );
            $( ".filter-list" ).addClass( "blurred" );
            $( ".filter-results" ).addClass( "blurred" );
            $( ".progress" ).addClass( "blurred" );
            $( ".cover" ).fadeIn();
            // Set update information
            $( ".update-title" ).html( "POE-Sniper - v" + data.version );
            $( ".update-date" ).html( new Date( data.date ).toLocaleString() + " by <b>" + data.author + "</b>"  );
            $( ".update-body" ).html( marked( data.changelog ));
            $( ".new-update" ).fadeIn( "fast" );

            $( "#download-update" ).click( function() {
                downloadUpdate( data.version );
            });

            $( "#dismiss-update" ).click( function() {
                dismissUpdate();
            });
        }
    });

    // Clean up old items
    setInterval( function() {
        $( ".old" ).each( function() {
            $( this ).slideUp().remove();
        });
        $( "#results-amount" ).text( $( ".entry:visible" ).length );
    }, 5000 );

    // Setup global clipboard
    $( "#global-clipboard" ).prop( "checked", config.globalClipboard );

    // Google analytics keep alive
    setInterval( function() {
        var iframe = document.getElementById( "google-analytics" );
        iframe.src = iframe.src;
    }, 60000 );

    // Pop filtered result queue at given interval
    setInterval( function() {
        var item = delayQueue.shift();
        if ( item ) {
            notifyNewItem( item );
        }
    }, config.NOTIFICATION_QUEUE_INTERVAL );

    // var toggleAllFiltersAction = function() {
    //     // Get all visible filters
    //     var toggleOn = false;
    //     $( ".filter-detail:visible" ).parent().find( ".cb" ).each( function() {
    //         if ( !$( this ).prop( "checked" )) {
    //             toggleOn = true;
    //         }
    //     });
    //     $( ".filter-detail:visible" ).parent().find( ".cb" ).each( function() {
    //         if ( toggleOn ) {
    //             $( this ).prop( "checked", true );
    //         } else {
    //             $( this ).prop( "checked", false );
    //         }
    //     });
    // };

    // $( "#toggle-all-filters" ).click( toggleAllFiltersAction )

    // Map internal types to poe.trade ones
    var matchTypeWithPoeTrade = function( type ) {
        switch ( type ) {
            case "Map Fragments":
                return "Fragment";
            case "Divination Card":
                return "Divination-card";
            case "Body Armour":
                return "Body-armor";
            case "Two Hand Sword":
                return "Two-handed sword";
            case "Two Hand Mace":
                return "Two-handed mace";
            case "Two Hand Axe":
                return "Two-handed axe";
            case "One Hand Sword":
                return "One-handed sword";
            case "One Hand Mace":
                return "One-handed mace";
            case "One Hand Axe":
                return "One-handed axe";
            default:
                return type;
        }
    };

    // Map internal types to poe.trade ones
    var matchPoeTradeTypeWithInternal = function( type ) {
        switch ( type ) {
            case "Fragment":
                return "Map Fragments";
            case "Divination-card":
                return "Divination Card";
            case "Body-armor":
                return "Body Armour";
            case "Two-handed sword":
                return "Two Hand Sword";
            case "Two-handed mace":
                return "Two Hand Mace";
            case "Two-handed axe":
                return "Two Hand Axe";
            case "One-handed sword":
                return "One Hand Sword";
            case "One-handed mace":
                return "One Hand Mace";
            case "One-handed axe":
                return "One Hand Axe";
            default:
                return type;
        }
    };

    // Fill in the filter form from the extracted poe.trade search
    var fillInFormWithPOETradeData = function( data ) {
        // console.log( data );
        if ( data.league === "Beta Standard" ) {
            data.league = "beta-Standard";
        } else if ( data.league === "Beta Hardcore" ) {
            data.league = "beta-Hardcore";
        }
        if ( !data.name && data.base !== "any" ) {
            $( "#item" ).val( data.base );
        } else if ( data.name ) {
            // Check if it's a unique name
            var uniqueName = "";
            async.each( itemTypes.unique.types, function( unique, cbUnique ) {
                if ( !uniqueName && data.name.indexOf( unique ) !== -1 ) {
                    uniqueName = unique;
                }
                cbUnique();
            }, function() {
                if ( uniqueName ) {
                    $( "#item" ).val( uniqueName );
                } else {
                    $( "#item" ).val( data.name );
                }
            });
        }
        if ( data.type !== "any" ) {
            $( "#item-type" ).val( matchTypeWithPoeTrade( data.type ));
        }
        $( "#armor" ).val( data.armour_min );
        $( "#es" ).val( data.shield_min );
        $( "#evasion" ).val( data.evasion_min );
        $( "#evasion" ).val( data.evasion_min );

        var index = 0;
        resetConditionSelector();
        async.eachLimit( Object.keys( data.modGroups ), 1, function( group, cbGroup ) {
            var generatedModGroup = "";
            var obj = {};
            if ( data.modGroups[group].type === "SUM" || 
                 data.modGroups[group].type === "COUNT" || 
                 data.modGroups[group].type === "WEIGHT" ) {
                index++;
                var parameter = "( " + data.modGroups[group].min + " - " + data.modGroups[group].max + " )";
                obj = {
                    "id":        data.modGroups[group].id,
                    "type":      data.modGroups[group].type,
                    "index":     "[" + index + "]",
                    "parameter": parameter
                };
                var ref = "[" + index + "]";
                // Add options to select
                $( "#condition-selector" ).append(
                    "<option value=\"" + group + "\">" + data.modGroups[group].type + " " + ref + "</option>"
                );
                $( "#condition-selector" ).material_select();
            } else {
                obj = {
                    "id":        data.modGroups[group].id,
                    "type":      data.modGroups[group].type,
                    "index":     "",
                };
            }   
            
            mu.compileAndRender( "condition.html", obj )
            .on( "data", function ( data ) {
                generatedModGroup += data.toString();
            })
            .on( "end", function () {
                // console.log( "Modified: " + generated );
                $( "#conditions" ).append( generatedModGroup );
                modGroups = data.modGroups;
                async.eachLimit( Object.keys( data.modGroups[group].mods ), 1, function( mod, cbMod ) {
                    console.log( data.modGroups[group].mods[mod] );
                    var weight = "";
                    if ( data.modGroups[group].type === "WEIGHT" ) {
                        weight = "Weight: " + data.modGroups[group].mods[mod].weight;
                    }
                    var generated = "";
                    // Find out the mod type (explicit, implicit, etc.)
                    var extractReg = /^\(([a-zA-Z ]+)\)\s*/;
                    var sharpReg   = /#/;
                    var match      = extractReg.exec( mod );
                    var matched;
                    if ( !match ) {
                        matched = "Explicit";
                    } else {
                        matched = match[1];
                    }
                    var displayMin = "<span class='value'>" + data.modGroups[group].mods[mod].min + "</span>";
                    var displayMax = "<span class='value'>" + data.modGroups[group].mods[mod].max + "</span>";
                    var title = mod;
                    var count = ( title.match( /#/g ) || []).length;
                    if ( count > 1 ) {
                        title = title.replace( "#", displayMin );
                        title = title.replace( "#", displayMax );
                    } else {
                        title = mod.replace( 
                            "#", "( " + displayMin + " - " + 
                                        displayMax + " )" );
                    }
                    
                    var obj = {
                        "title":  mod,
                        "min":    displayMin,
                        "max":    displayMax,
                        "affix":  title.replace( /^\([a-zA-Z ]+\)\s*/, "<span class='badge affix-" + matched.toLowerCase() +  "' data-badge-caption='" + matched + "'></span>" ),
                        "id":     data.modGroups[group].mods[mod].id,
                        "typeLC": matched.toLowerCase(),
                        "type":   matched,
                        "weight": weight
                    };
                    mu.compileAndRender( "affix.html", obj )
                    .on( "data", function ( data ) {
                        generated += data.toString();
                    })
                    .on( "end", function () {
                        // console.log( "Modified: " + generated );
                        $( "#condition-container-" + data.modGroups[group].id ).append( generated );
                        $( "#" + obj.id ).data( "data-item", obj );
                        // When clicking on remove affix
                        $( ".remove-affix" ).click( function() {
                            var id = $( this ).attr( "id" ).replace( "remove-affix-", "" );
                            $( this ).parent().parent().remove();
                            removeAffix( id );
                        });
                        bindAffixEdition( obj.id );
                        bindAffixHover( obj.id );
                        cbMod();
                    });
                }, function() {
                    cbGroup();
                });
            });
        });
        // Compute total links
        var totalLinks = 0;
        if ( !data.link_min ) {
            totalLinks = parseInt( data.linked_r ) + parseInt( data.linked_g ) + 
                         parseInt( data.linked_b ) + parseInt( data.linked_w );
        } else {
            totalLinks = data.link_min;
        }
        if ( totalLinks > 0 && totalLinks <= 4 ) {
            $( "#links" ).val( "0" );
        } else if ( totalLinks === "5" ) {
            $( "#links" ).val( "5" );
        } else if ( totalLinks === "6" ) {
            $( "#links" ).val( "6" );
        }
        $( "#links").material_select();
        // Compute sockets
        $( "#sockets-total" ).val( data.sockets_min );
        $( "#sockets-red" ).val( data.sockets_r );
        $( "#sockets-green" ).val( data.sockets_g );
        $( "#sockets-blue" ).val( data.sockets_b );
        $( "#sockets-white" ).val( data.sockets_w );
        $( "#level" ).val( data.ilvl_min );
        $( "#tier" ).val( data.level_min );
        $( "#quality" ).val( data.q_min );
        if ( data.corrupted !== "either" ) {
            $( "#corrupted" ).val( data.corrupted === "Yes" ? "true" : "false" );
            $( "#corrupted").material_select();
        }
        
        if ( data.crafted !== "either" ) {
            $( "#crafted" ).val( data.crafted === "Yes" ? "true" : "false" );
            $( "#crafted").material_select();
        }
        if ( data.enchanted !== "either" ) {
            $( "#enchanted" ).val( data.enchanted === "Yes" ? "true" : "false" );
            $( "#enchanted").material_select();
        }
        if ( data.identified !== "either" ) {
            $( "#identified" ).val( data.identified === "Yes" ? "true" : "false" );
            $( "#identified").material_select();
        }
        if ( data.rarity === "Normal" ) {
            $( "#rarity" ).val( 0 );
        } else if ( data.rarity === "Magic" ) {
            $( "#rarity" ).val( 1 );
        } else if ( data.rarity === "Rare" ) {
            $( "#rarity" ).val( 2 );
        } else if ( data.rarity === "Unique" ) {
            $( "#rarity" ).val( 3 );
        } else if ( data.rarity === "Relic" ) {
            $( "#rarity" ).val( 9 );
        }
        $( "#rarity").material_select();
        $( "#dps" ).val( data.dps_min );
        $( "#pdps" ).val( data.pdps_min );
        $( "#edps" ).val( data.edps_min );
        $( "#league" ).val( data.league );
        $( "#league").material_select();
        // Set price and currency
        if ( data.buyout_max ) {
            var poeTradeCurrency = Currency.currencyLookupTable[data.buyout_currency];
            if ( poeTradeCurrency ) {
                $( "#currency" ).val( poeTradeCurrency );
                $( "#price" ).val( data.buyout_max );
            }
            // } else if ( data.buyout_currency === "Exalted Orb" ) {
            //     $( "#currency" ).val( "exa" );
            //     $( "#price" ).val( data.buyout_max );
            // // Otherwise convert rate to chaos
            // } else if ( data.buyout_currency ) {
            //     $( "#currency" ).val( "chaos" );
            //     $( "#price" ).val( 
            //         Math.round( currencyRates[data.league][data.buyout_currency] * data.buyout_max * 100 ) / 100 );
            // }
            $( "#currency" ).material_select();   
        }
        // Buyout
        $( "#price-bo" ).prop( "checked", data.buyout === "Yes" ? true : false );
        Materialize.updateTextFields();
    };

    // When clicking on import button
    $( "#import" ).click( function() {
            Misc.extractPoeTradeSearchParameters( $( "#poe-trade-url" ).val(), function( data ) {
            // console.log( data );
            resetFilters();
            fillInFormWithPOETradeData( data );
        });
    });

    // When clicking on play sound
    $( "#play-sound" ).click( function() {
        // Grab selected audio sound and volume
        var sound    = $( "#sound-effect" ).val() + ".mp3";
        var volume   = $( "#sound-volume" ).val();
        var audio    = new Audio( __dirname + '/' + sound );
        audio.volume = volume / 100;
        audio.play();
    });

    var formatMessage = function( data, message, cb ) {
        var str = message;
        if ( data.name !== data.typeLine ) {
            data.name += " " + data.typeLine;
        }
        str     = str.replace( /<account>/g,  data.accountName );
        str     = str.replace( /<item>/g,     data.whisperName );
        str     = str.replace( /<league>/g,   data.league );
        str     = str.replace( /<stash>/g,    data.stashName );
        str     = str.replace( /<price>/g,    data.originalPrice );
        str     = str.replace( /<stashTab>/g, data.stashTab );
        str     = str.replace( /<left>/g,     data.left );
        str     = str.replace( /<top>/g,      data.top );
        cb( str );
    };

    // Sample item used for message preview
    var sampleItem = {
        accountName:   "ClearForest",
        whisperName:   "Necropolis Map",
        league:        "Standard",
        stashName:     "",
        originalPrice: "36 exa",
        stashTab:      "Mirror worthy",
        left:          "9",
        top:           "2",
    };

    // Toggle sub audio options when toggling audio switch
    $( "#use-audio-notifications" ).click( function() {
        toggleAudioNotification();
    });

    var toggleAudioNotification = function() {
        if ( !$( "#use-audio-notifications" ).prop( "checked" )) {
            $( "#sound-volume" ).prop( "disabled", true );
            $( "#sound-effect" ).prop( "disabled", true );
            $( "#play-sound" ).prop( "disabled", true );
            $( "label[for=sound-volume]" ).prop( "disabled", true );
            $( "#play-sound" ).addClass( "disabled" );
            $( "#sound-effect" ).material_select();
        } else {
            $( "#sound-volume" ).prop( "disabled", false );
            $( "#sound-effect" ).prop( "disabled", false );
            $( "#play-sound" ).prop( "disabled", false );
            $( "label[for=sound-volume]" ).prop( "disabled", true );
            $( "#play-sound" ).removeClass( "disabled" );
            $( "#sound-effect" ).material_select();
        }
    };
    
    var fillInSettings = function() {
        // Setup audio notifications options
        $( "#use-audio-notifications" ).prop( "checked", config.audioNotification );
        toggleAudioNotification();
        $( "#sound-effect" ).val( config.sound.replace( ".mp3", "" ));
        $( "#sound-effect" ).material_select();
        $( "#sound-volume" ).val( config.volume * 100 );
        // Setup visual notifications options
        $( "#use-visual-notifications" ).prop( "checked", config.visualNotification );
        $( "#notification-duration" ).val( config.NOTIFICATION_QUEUE_INTERVAL / 1000 );
        // Setup whisper options
        $( "#whisper-message" ).val( config.message );
        $( "#barter-message" ).val( config.barter );
        // fill in preview 
        formatMessage( sampleItem, config.message, function( str ) {
            $( "#whisper-preview" ).text( str );
        });
        formatMessage( sampleItem, config.barter, function( str ) {
            $( "#barter-preview" ).text( str );
        });
        // Setup performances options
        // Confine maxEntryAmount between 100 and 1000
        if ( !config.maxEntryAmount ) {
            config.maxEntryAmount = 100;
        } else {
            if ( config.maxEntryAmount < 100 ) {
                config.maxEntryAmount = 100;
            } else if ( config.maxEntryAmount > 1000 ) {
                config.maxEntryAmount = 1000;
            }
        }
        $( "#entry-amount-limit" ).val( config.maxEntryAmount );
        // Setup search engines
        if ( config.usePoeTradeStats ) {
            $( "#use-poeTradeStats" ).prop( "checked", true );
        }
        if ( config.showPoeTradeLink ) {
            $( "#show-poe-trade-search-link" ).prop( "checked", true );
        }
        if ( config.showPoeNinjaLink ) {
            $( "#show-poe-ninja-search-link" ).prop( "checked", true );
        }
        if ( config.showPoeRatesLink ) {
            $( "#show-poe-rates-search-link" ).prop( "checked", true );
        }
        if ( config.showPoeWikiLink ) {
            $( "#show-poe-wiki-search-link" ).prop( "checked", true );
        }
        // Setup debug
        if ( config.showFilterProcessingTime ) {
            $( "#show-filter-processing-time" ).prop( "checked", true );
        }
    };
    fillInSettings();

    var applySettings = function() {
        // Setup audio notifications
        config.audioNotification = $( "#use-audio-notifications" ).prop( "checked" );
        config.sound   = $( "#sound-effect" ).val() + ".mp3";
        config.volume  = $( "#sound-volume" ).val() / 100;
        // Setup visual notifications
        config.visualNotification = $( "#use-visual-notifications" ).prop( "checked" );
        config.NOTIFICATION_QUEUE_INTERVAL = $( "#notification-duration" ).val() * 1000;
        config.notifyClipboardCopy = $( "#notify-clipboard-copy" ).prop( "checked" );
        // Setup whisper options
        config.message = $( "#whisper-message" ).val();
        config.barter  = $( "#barter-message" ).val();
        // Setup performances options
        config.maxEntryAmount = $( "#entry-amount-limit" ).val();
        // Setup search engines
        config.usePoeTradeStats = $( "#use-poeTradeStats" ).prop( "checked" );
        config.showPoeTradeLink = $( "#show-poe-trade-search-link" ).prop( "checked" );
        config.showPoeNinjaLink = $( "#show-poe-ninja-search-link" ).prop( "checked" );
        config.showPoeRatesLink = $( "#show-poe-rates-search-link" ).prop( "checked" );
        config.showPoeWikiLink  = $( "#show-poe-wiki-search-link" ).prop( "checked" );
        // Setup debug
        config.showFilterProcessingTime = $( "#show-filter-processing-time" ).prop( "checked" );
        // save config
        saveConfig();
        // Hide or show elements
        displaySearchEngines();
        displayTimes();
        // If we use poe.trade stats and the elements are hidden
        if ( config.usePoeTradeStats && $( ".item-stats:visible" ).length === 0 ) {
            console.log( "Calling poe.trade stats" );
            poeTradeStats( filters.filterList );
        // If we do not use poe.trade stats, hide the elements
        } else if ( !config.usePoeTradeStats ) {
            $( ".item-stats" ).hide();
        }
    };

    // Bind applySettings function to apply button
    $( "#apply-settings" ).click( function() {
        applySettings();
    });

    // When changing whisper or barter message, update preview
    $( "#whisper-message" ).keyup( function() {
        var message = $( "#whisper-message" ).val();
        // fill in preview 
        formatMessage( sampleItem, message, function( str ) {
            $( "#whisper-preview" ).text( str );
        });
    });

    var saveConfig = function() {
        fs.writeFile( app.getPath( "userData" ) + path.sep + "config.json", JSON.stringify( config ), function( err ) {
            if ( err ) {
                console.log( err );
            }
        });
    };

    var toggleMode = function() {
        // If underpriced mode, hide filters and form
        if ( $( "#toggle-mispriced" ).prop( "checked" )) {
            $( ".underpriced-form").slideDown();
            $( ".filter-form" ).slideUp();
            $( ".filter-list" ).slideUp();
            $( "#cancel-filter" ).addClass( "disabled" );
            $( "#add-filter" ).addClass( "disabled" );
            $( "#import-poe-trade" ).addClass( "disabled" );
            $( ".progress" ).css( "top", "-8px" );
            config.checkUnderpriced = true;
            // Remove queue interval delay
            config.NOTIFICATION_QUEUE_INTERVAL = 0;
            saveConfig();
        } else {
            $( ".underpriced-form").slideUp();
            $( ".filter-form" ).slideDown();
            $( ".filter-list" ).slideDown();
            $( "#cancel-filter" ).removeClass( "disabled" );
            $( "#add-filter" ).removeClass( "disabled" );
            $( "#import-poe-trade" ).removeClass( "disabled" );
            $( ".progress" ).css( "top", "230px" );
            config.checkUnderpriced = false;
            config.NOTIFICATION_QUEUE_INTERVAL = 5000;
            saveConfig();
        }
    };

    $( "#toggle-mispriced" ).click( function() {
        toggleMode();
    });

    $( "#toggle-mispriced" ).prop( "checked", config.checkUnderpriced );
    toggleMode();

    // Bind modals
    $('.modal').modal();

    var bindAffixHover = function( id ) {
        var currentTitle     = "";
        var currentMin       = "";
        var currentMax       = "";
        var currentWeight    = "";
        var currentGroupMin  = "";
        var currentGroupMax  = "";
        var currentGroupType = "";
        $( ".affix-item#" + id ).mouseover( function() {
            currentTitle     = $( "#affixes" ).val();
            currentMin       = $( "#affix-min" ).val();
            currentMax       = $( "#affix-max" ).val();
            currentWeight    = $( "#affix-weight" ).val();
            currentGroupMin  = $( "#mod-group-min" ).val();
            currentGroupMax  = $( "#mod-group-max" ).val();
            currentGroupType = $( "#condition-selector" ).val();
            if ( !loadedAffix ) {
                var self = this;
                // Find the group type in modGroups
                var affix;
                var affixMin;
                var affixMax;
                var groupMin = "";
                var groupMax = "";
                var weight   = "";
                var groupType;
                var groupValue;
                var foundId = false;
                // Find the mod with the right id in modGroups
                async.eachLimit( Object.keys( modGroups ), 1, function( group, cbGroup ) {
                    async.eachLimit( Object.keys( modGroups[group].mods ), 1, function( mod, cbMod ) {
                        if ( modGroups[group].mods[mod].id === id ) {
                            foundId    = true;
                            affix      = mod;
                            affixMin   = modGroups[group].mods[mod].min;
                            affixMax   = modGroups[group].mods[mod].max;
                            groupType  = modGroups[group].type;
                            groupValue = group;
                            if ( groupType !== "IF" && groupType !== "NOT" && groupType !== "AND" ) {
                                groupMin = modGroups[group].min;
                                groupMax = modGroups[group].max;
                                if ( groupType === "WEIGHT" ) {
                                    weight = modGroups[group].mods[mod].weight;
                                }
                            }
                        }
                        cbMod();
                    }, function() {
                        cbGroup();
                    });
                }, function() {
                    if ( foundId ) {
                        affix = $( self ).text().trim();
                        console.log( affix );
                        var type  = $( self ).parent().find( ".badge" ).data( "badge-caption" );
                        // Extract title
                        var regPar = /\([^()]+\)/g;
                        var regNum = /([0-9…]+)/g;
                        var match = regPar.exec( affix );
                        var title;
                        if ( match ) {
                            title = "(" + type + ") " + affix.replace( regPar, "#" ).trim();
                        } else {
                            title = "(" + type + ") " + affix.replace( regNum, "#" ).trim();
                        }
                        // Replace affix form with select affix values
                        $( "#affixes" ).val( title.trim());
                        $( "#affix-min" ).val( affixMin );
                        $( "#affix-max" ).val( affixMax );
                        $( "#affix-weight" ).val( weight );
                        $( "#mod-group-min" ).val( groupMin );
                        $( "#mod-group-max" ).val( groupMax );
                        $( "#condition-selector" ).val( groupValue );
                        $( "#condition-selector" ).material_select();
                        Materialize.updateTextFields();
                        if ( groupType === "WEIGHT" ) {
                            $( ".form-affix-value" ).hide();
                            $( ".form-affix-weight" ).show();
                        } else {
                            $( ".form-affix-value" ).show();
                            $( ".form-affix-weight" ).hide();
                        }
                        // Replace affix form with select affix values
                        $( "#affixes" ).addClass( "affix-preview" );
                        $( "#affix-min" ).addClass( "affix-preview" );
                        $( "#affix-max" ).addClass( "affix-preview" );
                        $( "#affix-weight" ).addClass( "affix-preview" );
                        $( "#mod-group-min" ).addClass( "affix-preview" );
                        $( "#mod-group-max" ).addClass( "affix-preview" );
                        // console.log( title.trim() + " " + affixMin + " - " + affixMax );
                    }
                });
            }
        });
        $( ".affix-item#" + id ).mouseout( function() {
            if ( !loadedAffix ) {
                $( "#affixes" ).val( currentTitle );
                $( "#affixes" ).removeClass( "affix-preview" );
                $( "#affix-min" ).val( currentMin );
                $( "#affix-min" ).removeClass( "affix-preview" );
                $( "#affix-max" ).val( currentMax );
                $( "#affix-max" ).removeClass( "affix-preview" );
                $( "#affix-weight" ).val( currentWeight );
                $( "#mod-group-min" ).val( currentGroupMin );
                $( "#mod-group-max" ).val( currentGroupMax );
                $( "#affix-weight" ).removeClass( "affix-preview" );
                $( "#mod-group-min" ).removeClass( "affix-preview" );
                $( "#mod-group-max" ).removeClass( "affix-preview" );
                Materialize.updateTextFields();
                $( "#condition-selector" ).val( currentGroupType );
                $( "#condition-selector" ).material_select();
                $( ".form-affix-value" ).show();
                $( ".form-affix-weight" ).hide();
            }
            // loadedAffix = false;
        });
    };

    // When clicking on affix to edit
    var bindAffixEdition = function( id ) {
        $( ".affix-item#" + id ).click( function() {
            var self = this;
            // Find the group type in modGroups
            var affix;
            var affixMin;
            var affixMax;
            var groupMin = "";
            var groupMax = "";
            var weight   = "";
            var groupType;
            var groupValue;
            var foundId = false;
            async.eachLimit( Object.keys( modGroups ), 1, function( group, cbGroup ) {
                async.eachLimit( Object.keys( modGroups[group].mods ), 1, function( mod, cbMod ) {
                    if ( modGroups[group].mods[mod].id === id ) {
                        foundId    = true;
                        affix      = mod;
                        affixMin   = modGroups[group].mods[mod].min;
                        affixMax   = modGroups[group].mods[mod].max;
                        groupType  = modGroups[group].type;
                        groupValue = group;
                        if ( groupType !== "IF" && groupType !== "NOT" && groupType !== "AND" ) {
                            groupMin = modGroups[group].min;
                            groupMax = modGroups[group].max;
                            if ( groupType === "WEIGHT" ) {
                                weight = modGroups[group].mods[mod].weight;
                            }
                            // Enable group min and max fields
                            $( "#mod-group-min" ).prop( "disabled", false );
                            $( "#mod-group-max" ).prop( "disabled", false );
                        } else {
                            // Disable group min and max fields
                            $( "#mod-group-min" ).prop( "disabled", true );
                            $( "#mod-group-max" ).prop( "disabled", true );
                        }
                    }
                    cbMod();
                }, function() {
                    cbGroup();
                });
            }, function() {
                if ( foundId ) {
                    $( "#affixes" ).prop( "disabled", true );
                    loadedAffix = true;
                    console.log( loadedAffix );
                    editingAffix = id;
                    affix = $( self ).text();
                    var type  = $( self ).parent().find( ".badge" ).data( "badge-caption" );
                    // Extract title
                    var regPar = /\([^()]+\)/g;
                    var regNum = /([0-9…]+)/g;
                    var match = regPar.exec( affix );
                    var title;
                    if ( match ) {
                        title = "(" + type + ") " + affix.replace( regPar, "#" ).trim();
                    } else {
                        title = "(" + type + ") " + affix.replace( regNum, "#" ).trim();
                    }
                    // Replace affix form with select affix values
                    $( "#affixes" ).val( title.trim());
                    $( "#affix-min" ).val( affixMin );
                    $( "#affix-max" ).val( affixMax );
                    $( "#affix-weight" ).val( weight );
                    $( "#mod-group-min" ).val( groupMin );
                    $( "#mod-group-max" ).val( groupMax );
                    $( "#condition-selector" ).val( groupValue );
                    $( "#condition-selector" ).material_select();
                    Materialize.updateTextFields();
                    if ( groupType === "WEIGHT" ) {
                        $( ".form-affix-value" ).hide();
                        $( ".form-affix-weight" ).show();
                    } else {
                        $( ".form-affix-value" ).show();
                        $( ".form-affix-weight" ).hide();
                    }
                    $( "#add-affix" ).removeClass( "disabled" );
                    $( "#cancel-affix" ).removeClass( "disabled" );
                    $( "#add-affix" ).text( "Upd." );
                    console.log( title.trim() + " " + affixMin + " - " + affixMax );
                } else {
                    console.log( "Didn't find id" );
                }
            });
        });
    };

    // If affixes is not empty, activate add affix button
    $( "#affixes" ).keyup( function() {
        if ( $( this ).val() !== "" ) {
            $( "#add-affix" ).removeClass( "disabled" );
        } else {
            $( "#add-affix" ).addClass( "disabled" );
        }
    });

    loadItemBlackList( function( list ) {
        itemBlackList = list;
        console.log( itemBlackList );
        itemBlackList.save();
    });
    loadPlayerBlackList( function( list ) {
        playerBlackList = list;
        console.log( playerBlackList );
        playerBlackList.save();
    });
});