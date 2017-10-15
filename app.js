// load required modules
var alexa = require('alexa-app');
var net = require('net');
require('log-timestamp');

// allow this module to be reloaded by hotswap when changed
module.change_code = 1;

// load configuration parameters
var config = require("./config.json");
var strings = require("./strings.json");
var apps = require("./apps.json");
var commandIntents = require("./commandIntents.json");
var channels = require("./channels.json");

// load settings from config file
var route = config.route || "tivo_control";

// set apps order
var apps_order = [];

// define variables
var queuedCommands = [];
var telnetSocket;
var socketOpen = false;
var interval;
var noResponse = true;
var speechList = "";
var cardList = "";
var tivoIndex = 0;
var totalTiVos = Object.keys(config.tivos).length;
var lastTivoBox = tivoIndex;
var channelName = ""; 
var tivoBoxRoom = "";
var roomFound = false;
var genres = strings["genres"];

// macro setup (if enabled)
var macros = "";
var totalMacros = 0;
if (config.macros) {
    macros = require("./macros.json");
    totalMacros = Object.keys(macros).length;
    console.log("User-defined macros enabled (" + totalMacros + " found).");
}

// set default TiVo (first one in config file)
updateCurrentTiVoConfig(tivoIndex);

// define an alexa-app
var app = new alexa.app(route);

// verify appId for incoming request
app.pre = function(request,response,type) {
    if (request.hasSession()) {
        var session = request.getSession();
        if (session.details.application.applicationId!=config.alexaAppId &&
            session.details.application.applicationId!=strings.alexaTestAppId) {
            response.fail("An invalid applicationId was received.");
        }
    }
};

// general error handling
app.error = function(exception, request, response) {
    console.log(exception);
    response.say("Sorry, an error has occured. Please try your request again.");
};

// command-grouping arrays ---------------------------------------------

var IRCODE_COMMANDS = ["UP", "DOWN", "LEFT", "RIGHT", "SELECT", "TIVO", "LIVETV", "GUIDE", "INFO", "EXIT", "THUMBSUP", "THUMBSDOWN", "CHANNELUP", "CHANNELDOWN", "MUTE", "VOLUMEUP", "VOLUMEDOWN", "TVINPUT", "VIDEO_MODE_FIXED_480i", "VIDEO_MODE_FIXED_480p", "VIDEO_MODE_FIXED_720p", "VIDEO_MODE_FIXED_1080i", "VIDEO_MODE_HYBRID", "VIDEO_MODE_HYBRID_720p", "VIDEO_MODE_HYBRID_1080i", "VIDEO_MODE_NATIVE", "CC_ON", "CC_OFF", "OPTIONS", "ASPECT_CORRECTION_FULL", "ASPECT_CORRECTION_PANEL", "ASPECT_CORRECTION_ZOOM", "ASPECT_CORRECTION_WIDE_ZOOM", "PLAY", "FORWARD", "REVERSE", "PAUSE", "SLOW", "REPLAY", "ADVANCE", "RECORD", "NUM0", "NUM1", "NUM2", "NUM3", "NUM4", "NUM5", "NUM6", "NUM7", "NUM8", "NUM9", "ENTER", "CLEAR", "ACTION_A", "ACTION_B", "ACTION_C", "ACTION_D", "BACK", "WINDOW"];

var KEYBOARD_COMMANDS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "MINUS", "EQUALS", "LBRACKET", "RBRACKET", "BACKSLASH", "SEMICOLON", "QUOTE", "COMMA", "PERIOD", "SLASH", "BACKQUOTE", "SPACE", "KBDUP", "KBDDOWN", "KBDLEFT", "KBDRIGHT", "PAGEUP", "PAGEDOWN", "HOME", "END", "CAPS", "LSHIFT", "RSHIFT", "INSERT", "BACKSPACE", "DELETE", "KBDENTER", "STOP", "VIDEO_ON_DEMAND"];

var TELEPORT_COMMANDS = ["TIVO", "GUIDE", "NOWPLAYING"];

// custom slots --------------------------------------------------------

app.customSlot("TIVOCOMMAND_SLOT", ["UP", "DOWN", "LEFT", "RIGHT", "SELECT", "TIVO", "THUMBSUP", "THUMBSDOWN", "CHANNELUP", "CHANNELDOWN", "MUTE", "VOLUMEDOWN", "VOLUMEUP", "TVINPUT", "OPTIONS", "RECORD", "DISPLAY", "DIRECTV", "ENTER", "CLEAR", "PLAY", "PAUSE", "SLOW", "FORWARD", "REVERSE", "STANDBY", "NOWSHOWING", "REPLAY", "ADVANCE", "BACK", "WINDOW", "GUIDE", "EXIT", "STOP", "DELIMITER", "KBDUP", "KBDDOWN", "KBDLEFT", "KBDRIGHT", "PAGEUP", "PAGEDOWN", "HOME", "END", "SPACE", "BACKQUOTE", "SLASH", "PERIOD", "COMMA", "QUOTE", "SEMICOLON", "BACKSLASH", "RBRACKET", "LBRACKET", "EQUALS", "MINUS", "CAPS", "LSHIFT", "RSHIFT", "INSERT", "BACKSPACE", "DELETE", "KBDENTER", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "NUM0", "NUM1", "NUM2", "NUM3", "NUM4", "NUM5", "NUM6", "NUM7", "NUM8", "NUM9", "ACTION_A", "ACTION_B", "ACTION_C", "ACTION_D"]);

// launch --------------------------------------------------------------

app.launch(function(request,response) {
    response.say(strings.txt_welcome + strings.txt_launch);
});

if ((process.argv.length === 3) && (process.argv[2] === 'schema'))  {
    console.log (app.schema ());
    console.log (app.utterances ());
    console.log (app.schemas.skillBuilder ());
}

// intents -------------------------------------------------------------

// HELP

app.intent('Help',
    {
        "slots":{},
        "utterances":[ "{for|} {help|assistance}" ]
    },
    function(request,response) {
        console.log("Help requested, adding card.");
        response.say(strings.txt_launch + strings.txt_card);
        response.card("Help", strings.txt_help);
    });

app.intent('ListEnabledApps',
    {
        "slots":{},
        "utterances":[ "{for|to} {my apps|list my apps|app|list apps|app list|list enabled apps}" ]
    },
    function(request,response) {
        console.log("List of enabled applications requested, adding card.");
        createAppList();
        response.say(strings.txt_enabledlist + currentTiVoBox + strings.txt_enabledlist2 + speechList + strings.txt_enabledcard);
        response.card("Apps", strings.txt_appcard + currentTiVoBox + strings.txt_appcard2 + cardList + strings.txt_appfooter);
    });

app.intent('ListChannels',
    {
        "slots":{"GENRE":"AMAZON.Genre"},
        "utterances":[ "{for|to} {my channels|my channel list|list my channels|list channels|channel list|list channel names} {for +GENRE+|by +GENRE+|}" ]
    },
    function(request,response) {
        var genre = String(request.slot("GENRE"));
        genre = genre.toLowerCase();
        console.log("List of named channels requested, adding card.");
        if (genre == 'undefined') {
            genre = "all";
            createChannelList(genre);
        } else if (genres.indexOf(genre) < 0) {
            console.log("Genre selected: " + genre);
            response.say("Requested genre not found. Genres available are ." + genres + strings.txt_enabledcard);
            genres = genres.toUpperCase();
            genres = genres.replace(/\,\ /g, "\n- ");
            console.log("List of genres:\n- " + genres);
            response.card("Channel Genres", strings.txt_genrecard + "\n\n- " + genres + strings.txt_genrefooter);
            genres = genres.toLowerCase();
            return
        } else {
            createChannelList(genre);
        }
        response.say(strings.txt_channelscard + genre + strings.txt_channelscard2say + speechList + strings.txt_enabledcard);
        response.card("Channels  (" + genre + ")", strings.txt_channelscard + genre + strings.txt_channelscard2 + cardList + strings.txt_channelsfooter);
    });
	
app.intent('ListGenres',
    {
        "slots":{},
        "utterances":[ "{for|to} {my genres|my channel genres|list my genres|list genres|genres list}" ]
    },
    function(request,response) {
        genres = genres.toUpperCase();
        console.log("List of channel genres requested, adding card.");
        response.say("Your channel genres are ." + genres + strings.txt_enabledcard);
        genres = genres.replace(/\,\ /g, "\n- ");
        console.log("List of genres:\n- " + genres);
        response.card("Channel Genres", strings.txt_genrecard + "\n\n- " + genres + strings.txt_genrefooter);
        genres = genres.toLowerCase();
    });
	
app.intent('ListMacros',
    {
        "slots":{},
        "utterances":[ "{for|to} {my macros|list my macros|list macros|macros list}" ]
    },
    function(request,response) {
        if (config.macros) {
            console.log("List of macros requested, adding card.");
            speechList = "";
            cardList = "";
            for (i = 0; i < totalMacros; i++) {
                speechList = speechList + macros[i].name + ",";
                cardList = cardList + "\n- \"" + macros[i].name.toUpperCase() + "\" - "  + macros[i].description;
            }
            response.say("Your TiVo Control macros are ." + speechList + strings.txt_enabledcard);
            console.log("List of macros:" + cardList);
            response.card("User Macros", strings.txt_macrocard + cardList + strings.txt_macrocard2);
        }
        else {
            response.say(strings.txt_nomacros);
        }
    });

// BOX SELECTION

app.intent('ChangeTiVoBox',
    {
       "slots":{"TIVOBOX":"AMAZON.Room"},
        "utterances":[ "{to|} {control|select|switch to|use} {-|TIVOBOX}" ]
    },
    function(request,response) {

        if (totalTiVos > 1) {
            currentTiVoBox = request.slot("TIVOBOX");
            console.log("Control requested for '" + currentTiVoBox + "' TiVo.");

            // confirm selected TiVo exists in config.json
            tivoIndex = findTiVoBoxConfig(currentTiVoBox);

            if (tivoIndex < 0) {
                // the requested TiVo doesn't exist in the config file
                console.log("Undefined TiVo requested. Switching back to default.");
                response.say(strings.txt_undefinedtivo + currentTiVoBox + strings.txt_undefinedtivo2);
                tivoIndex = 0;
            }
        }
        else {
            // only one TiVo is configured so ignore the any switch requests
            response.say(strings.txt_onetivo);
        }

        updateCurrentTiVoConfig(tivoIndex);
        lastTivoBox = tivoIndex;
        response.say("Currently controlling your " + currentTiVoBox + " Tivo.");
    });

app.intent('WhichTiVoBox',
    {
       "slots":{},
        "utterances":[ "{which|current} {tivo|tivo box|dvr|box}" ]
    },
    function(request,response) {
        console.log("Currently controlling: " + currentTiVoBox + " (" + currentTiVoIP + ")");
        response.say("Currently controlling your " + currentTiVoBox + " Tivo.");
    });

app.intent('ListTiVoBoxes',
    {
        "slots":{},
        "utterances":[ "{for|to} {my tivos|list my tivos|tivo|list tivos|tivo list|list tivo boxes|list boxes}" ]
    },
    function(request,response) {
        console.log("List of TiVo boxes requested, adding card.");
        createTiVoBoxList();
        response.say(strings.txt_tivolistsay + speechList + strings.txt_enabledcard);
        response.card("TiVo Boxes", strings.txt_tivolistcard + cardList + strings.txt_tivofooter);
    });

// PLACES

function CommandsForTypeString(string) {
  var commands = [];
  for (i = 0; i < string.length; i++) {
    var char = string[i];
    if (char === " ") {
      commands.push("SPACE");
    } else {
      commands.push(char.toUpperCase());
    }
  }
  return commands;
}

app.intent('Search',
    {
        "slots":{"TIVOSEARCHREQMOVIE":"AMAZON.Movie","TIVOSEARCHREQTVSERIES":"AMAZON.TVSeries"},
        "utterances":[ "{go to|to|open|open up|display|launch|show|} {search|find} {for +TIVOSEARCHREQMOVIE+|+TIVOSEARCHREQMOVIE+|for +TIVOSEARCHREQTVSERIES+|+TIVOSEARCHREQTVSERIES+|}" ]
    },
    function(request,response) {
        var commands = [];
        commands.push("TIVO");
        commands.push("NUM4");
        
        var TIVOSEARCHREQMOVIE = String(request.slot("TIVOSEARCHREQMOVIE"));
        console.log(TIVOSEARCHREQMOVIE);
        if (TIVOSEARCHREQMOVIE != 'undefined') {
          console.log("Search Movie");
          Array.prototype.push.apply(commands, CommandsForTypeString(TIVOSEARCHREQMOVIE));
        }
        
        var TIVOSEARCHREQTVSERIES = String(request.slot("TIVOSEARCHREQTVSERIES"));
        console.log(TIVOSEARCHREQTVSERIES);
        if (TIVOSEARCHREQTVSERIES != 'undefined') {
          console.log("Search Television");
          Array.prototype.push.apply(commands, CommandsForTypeString(TIVOSEARCHREQTVSERIES));
        }
        
        sendCommands(commands);
    });

app.intent('Type',
    {
        "slots":{"TIVOTYPEREQMOVIE":"AMAZON.Movie","TIVOTYPEREQTVSERIES":"AMAZON.TVSeries"},
        "utterances":[ "{to|} type {+TIVOTYPEREQMOVIE+|+TIVOTYPEREQTVSERIES+}" ]
    },
    function(request,response) {
        var commands = [];
        
        var TIVOTYPEREQMOVIE = String(request.slot("TIVOTYPEREQMOVIE"));
        console.log(TIVOTYPEREQMOVIE);
        if (TIVOTYPEREQMOVIE != 'undefined') {
          console.log("Type Movie");
          Array.prototype.push.apply(commands, CommandsForTypeString(TIVOTYPEREQMOVIE));
        }
        
        var TIVOTYPEREQTVSERIES = String(request.slot("TIVOTYPEREQTVSERIES"));
        console.log(TIVOTYPEREQTVSERIES);
        if (TIVOTYPEREQTVSERIES != 'undefined') {
          console.log("Type Television");
          Array.prototype.push.apply(commands, CommandsForTypeString(TIVOTYPEREQTVSERIES));
        }
        
        sendCommands(commands);
    });

app.intent('WhatToWatch',
    {
        "slots":{},
        "utterances":[ "{go to|open|open up|display|launch|show} {what to|} watch {now|}", "what to watch {now|}" ]
    },
    function(request,response) {
        var commands = [];
        commands.push("TIVO");
        commands.push("DOWN");
        if (tivoMini) {
            commands.push("DOWN");
        }
        commands.push("RIGHT");
        sendCommands(commands);
    });

// CONTROL

app.intent('ChangeChannel',
    {
        "slots":{"TIVOCHANNEL":"NUMBER","TIVOBOXRM":"AMAZON.Room"},
        "utterances":[ "{change|go to} channel {to|} {1-100|TIVOCHANNEL} {in +TIVOBOXRM+|on +TIVOBOXRM+|}" ]
    },
    function(request,response) {
        var commands = [];

        lastTivoBox = tivoIndex;
        tivoBoxRoom = request.slot("TIVOBOXRM");
        roomFound = setTiVoRoom(tivoBoxRoom, response);

        if (roomFound) {
            if (tivoMini) {
                for (pos = 0 ; pos < request.slot("TIVOCHANNEL").length ; pos++) {
                    commands.push("NUM"+request.slot("TIVOCHANNEL").substring(pos,pos+1));
                }
                commands.push("ENTER");
            }
            else {
	        commands.push("SETCH "+request.slot("TIVOCHANNEL"));
            }
	    return sendCommands(commands, true);
        }
    });

app.intent('PutOn',
    {
        "slots":{"CHANNELNAME":"AMAZON.TelevisionChannel","TIVOBOXRM":"AMAZON.Room"},
        "utterances":[ "put {on|} {-|CHANNELNAME} {in +TIVOBOXRM+|on +TIVOBOXRM+|}" ]
    },
    function(request,response) {
        var commands = [];
        var chnl = String(request.slot("CHANNELNAME"));
        var chnlnum = "";

        chnl = chnl.toLowerCase();
        console.log("Request to put on channel: " + chnl);

        for (channelName in channels) {
            if (channels[channelName].alias == chnl) {
                console.log("found in channels.json (channel: " + channels[channelName].channel + ")");
                chnlnum = channels[channelName].channel;
            }
        }
        
        lastTivoBox = tivoIndex;
        tivoBoxRoom = request.slot("TIVOBOXRM");
        roomFound = setTiVoRoom(tivoBoxRoom, response);

        if (roomFound) {
            if (chnlnum != "") {
                if (tivoMini) {
                    for (pos = 0; pos < chnlnum.length; pos++) {
                        commands.push("NUM" + chnlnum.substring(pos,pos+1));
                    }
                    commands.push("ENTER");
                }
                else {
                    commands.push("SETCH " + chnlnum);
                }
                return sendCommands(commands, true);
            }
            else {
                console.log("Unmapped channel: " + chnl);
                response.say(strings.txt_undefinedchannel + chnl + strings.txt_undefinedchannel2);
                setLastTivo();
            }
        }
    });
	
app.intent('ForceChannel',
    {
        "slots":{"TIVOCHANNEL":"NUMBER","TIVOBOXRM":"AMAZON.Room"},
        "utterances":[ "force channel {to|} {1-100|TIVOCHANNEL} {in +TIVOBOXRM+|on +TIVOBOXRM+|}" ]
    },
    function(request,response) {
        var commands = [];

        lastTivoBox = tivoIndex;
        tivoBoxRoom = request.slot("TIVOBOXRM");
        setTiVoRoom(tivoBoxRoom, response);

        if (roomFound) {
            if (tivoMini) {
                for (pos = 0 ; pos < request.slot("TIVOCHANNEL").length ; pos++) {
                    commands.push("NUM"+request.slot("TIVOCHANNEL").substring(pos,pos+1));
                }
                commands.push("ENTER");
            }
            else {
                commands.push("FORCECH "+request.slot("TIVOCHANNEL"));
            }
            return sendCommands(commands, true);
        }
    });

// SIMPLE COMMANDS

commandIntents.forEach(function(intent, index) {
  app.intent(intent.name,
      {
          "slots":{},
          "utterances":intent.utterences
      },
      function(request,response) {
          sendCommands(intent.commands);
      });
});

// ADVANCED

app.intent('SendCommand',
    {
        "slots":{"TIVOCOMMAND":"TIVOCOMMAND_SLOT"},
        "utterances":[ "send {the command|command} {-|TIVOCOMMAND}", "send {the|} {-|TIVOCOMMAND} {command}", "send {-|TIVOCOMMAND}" ]
    },
    function(request,response) {
        var commands = [];
        commands.push(request.slot("TIVOCOMMAND").toUpperCase());
        sendCommands(commands);
    });

app.intent('ExecuteMacro',
    {
        "slots":{"USERMACRO":"TIVOMACRO_SLOT"},
        "utterances":[ "{run|execute} macro {-|USERMACRO}" ]
    },
    function(request,response) {
        if (config.macros) {
            processMacro(request.slot("USERMACRO").toUpperCase(), response);
        }
        else {
            response.say(strings.txt_nomacros);
        }
    });

// APPS

Object.keys(apps).forEach(function(tivoAppKey, index) {
    var tivoApp = apps[tivoAppKey];

    app.intent(tivoApp.name.replace(/\s/g, ''),
        {
            "slots":{},
            "utterances":[ "{go to|open|turn on|open up|display|jump to|launch}" + tivoApp.utterence_key]
        },
        function(request,response) {
            if (checkAppEnabled(tivoAppKey)) {
                response.say("Launching " + tivoApp.name);
                var commands = [];
                commands = addInitCommands(commands);
                commands = openAppsCommands(commands);
                commands = buildAppNavigation(tivoAppKey, commands);
                sendCommands(commands);
            }
            else {
                response.say(tivoApp.name + strings.txt_notenabled);
            }
        });
});

// functions -----------------------------------------------------------

function sendNextCommand () {

    clearInterval(interval);
    if (queuedCommands.length == 0) {
	// the queue is empty, disconnect
        if (typeof telnetSocket != "undefined" && typeof telnetSocket.end != "undefined") {
            telnetSocket.end();
            telnetSocket.destroy();
            console.log("Connection Closed");
            if (lastTivoBox != tivoIndex) {
                setLastTivo();
            }
        }
        socketOpen = false;
    }
    else {
        var command = queuedCommands.shift();
        var timeToWait = 300;
        if (queuedCommands[0] == "RIGHT" || queuedCommands[0] == "ENTER") {
            // wait slightly longer to allow for screen changes
            if (tivoMini) {
                timeToWait = 1100;
            } else {
                timeToWait = 800;
            }
        }
	
        if (typeof command == "object" && typeof command["explicit"] != "undefined") {
            // when explicit is true, send the full command as passed
            console.log("Sending Explicit Command: " + command["command"].toUpperCase());
            telnetSocket.write(command["command"].toUpperCase() + "\r");
            if (command.indexOf("TELEPORT")) {
                timeToWait = 2500;
            }
        } else {
            // when explicit is false, add the proper command prefix (IRCODE, KEYBOARD, etc.)
            if (typeof command == "object") {
                command = command["command"];
            }

            var prefix = determinePrefix(command);
            if (prefix === false) {
                console.log("ERROR: Command Not Supported: " + command);
                telnetSocket.end();
            }
            else {
                console.log("Sending Prefixed Command: "+prefix + " " + command.toUpperCase());
                telnetSocket.write(prefix + " " + command.toUpperCase() + "\r");
            }
            if (prefix == "TELEPORT") {
                timeToWait = 2500;
            }
        }
        setTimeout(sendNextCommand, timeToWait);
    }
}

// send a series of queued-up commands to the TiVo (with delays in-between)
function sendCommands(commands) {

    var host = currentTiVoIP;
    var port = currentTiVoPort;

    // move the list of passed-in commands into queuedCommands
    queuedCommands = [];
    for (var i=0; i<commands.length; i++) {
        queuedCommands.push(commands[i]);
    }
    console.log("QueuedCommands: "+queuedCommands.join(","));

    // open the telnet connection to the TiVo
    telnetSocket = net.createConnection({
        port: port,
        host: host
    });

    // log successful connection
    telnetSocket.on('connect', function(data) {
        console.log("Connection Created");
        socketOpen = true;
    });

    // data received back from TiVo (usually indicates command sent during Live TV)
    telnetSocket.on('data', function(data) {
        if (noResponse) {
            noResponse = false;
            console.log("RECEIVED: "+data.toString());
            interval = setInterval(sendNextCommand, 300);
        }
    });

    // timeout; send next command if the connection is still open
    telnetSocket.on('timeout', function(data) {
    console.log("TIMEOUT RECEIVED");
        if (socketOpen) {
            sendNextCommand();
        }
    });

    // connection has been closed
    telnetSocket.on('end', function(data) {
        socketOpen = false;
    });
    noResponse = true;

    setTimeout(function() {
        if (noResponse) {
            setTimeout(sendNextCommand, 700);
        }
    }, 700);
}

// determine prefix for a command
function determinePrefix(command) {
    if (TELEPORT_COMMANDS.indexOf(command) != -1) {
        return "TELEPORT";
    } else if (IRCODE_COMMANDS.indexOf(command) != -1) {
        return "IRCODE";
    } else if (KEYBOARD_COMMANDS.indexOf(command) != -1) {
        return "KEYBOARD";
    } else if ((command.substring(0,5) == "SETCH") || (command.substring(0,7) == "FORCECH")) {
        return "";
    } else {
        return false;
    }
}

// reset to known location (i.e., TiVo Central)
function addInitCommands(commands) {
    commands.push("TIVO");
    return commands;
}

// go to Apps menu
function openAppsCommands(commands) {
    commands.push("DOWN");
    commands.push("DOWN");
    if (tivoMini) {
        commands.push("DOWN");
    }
    commands.push("RIGHT");
    return commands;
}

// build dynamic navigation based on which apps are enabled
function buildAppNavigation(appID, commands) {

    var app_loc = apps_order.indexOf(appID);

    console.log("building navigation for app (" + appID + ")");

    for (loc = 1; loc <= app_loc; loc++) {
        commands.push("DOWN");
    }
    commands.push("RIGHT");
    return commands;
}

// determine if a specified app is enabled in the configuration file
function checkAppEnabled(appID) {

    console.log("checking status of app (" + appID + ")");

    var enabled = apps_order.indexOf(appID) >= 0;

    if (enabled) {
        console.log("- enabled");
    } else {
        console.log("- disabled");
    }

    return enabled;
}

// generate a list of apps and their status (to be spoken and added to help card)
function createAppList() {

    speechList = "";
    cardList = "";

    console.log("building list of apps");
    var names = [];
    for (loc = 0; loc < apps_order.length; loc++) {
        var tivoAppKey = apps_order[loc];
        var tivoApp = apps[tivoAppKey];
        names.push(tivoApp.name);
        cardList = cardList + "\n- " + tivoApp.name;
    }
    
    speechList = names.join(", ");

    console.log("speech list:\n " + speechList + "\ncard list: " + cardList);

}

// generate a list of TiVo boxes from the config file (to be spoken and added to help card)
function createTiVoBoxList() {

    speechList = "";
    cardList = "";

    console.log("building list of TiVo boxes");
    var names = [];
    for (i = 0; i < totalTiVos; i++) {
        names.push(config.tivos[i].name);
        cardList = cardList + "\n- " + config.tivos[i].name;
        // indicate default TiVo box
        if (i == 0) {
            cardList = cardList + " (default)";
        }
        // indicate current TiVo box
        if (i == tivoIndex) {
            cardList = cardList + " [current]";
        }
    }
    
    speechList = names.join(", ");

    console.log("speech list:\n " + speechList + "\ncard list: " + cardList);

}

function setTiVoRoom(tivoBoxRoom, response) {

    if (tivoBoxRoom != undefined) { 
        console.log("Last TiVo box index: " + tivoIndex);
        currentTiVoBox = tivoBoxRoom;
        console.log("Control requested for '" + currentTiVoBox + "' TiVo.");

        // confirm selected TiVo exists in config.json
        tivoIndex = findTiVoBoxConfig(currentTiVoBox);

        if (tivoIndex < 0) {
            // the requested TiVo doesn't exist in the config file
            console.log("Undefined TiVo requested. Switching back to default.");
            response.say(strings.txt_undefinedtivo + tivoBoxRoom + strings.txt_undefinedtivo2);
            tivoIndex = 0;
            updateCurrentTiVoConfig(tivoIndex);
            return false;
        }
        else {
            updateCurrentTiVoConfig(tivoIndex);
            return true;
        }
    }
    else {
        // no room specified, allow command to go to current tivo
        return true;
    }

}

function setLastTivo() {

    console.log("Setting last TiVo");
    tivoIndex = lastTivoBox;
    updateCurrentTiVoConfig(tivoIndex);

}

// find the index of the requested TiVo in the config file
function findTiVoBoxConfig(currentTiVoBox) {

    console.log("Searching for '" + currentTiVoBox +"' in config file ...");
    for (i = 0; i < totalTiVos; i++) {
        if (config.tivos[i].name.toLowerCase() == currentTiVoBox.toLowerCase()) {
            console.log("Found! (" + i + ")");
            return i;
        }
    }

    console.log("Not found!");
    return -1;
}

// update all variables related to the currently selected TiVo
function updateCurrentTiVoConfig(tivoIndex) {

    currentTiVoBox = config.tivos[tivoIndex].name;
    currentTiVoIP = config.tivos[tivoIndex].address;
    currentTiVoPort = config.tivos[tivoIndex].port;
    tivoMini = config.tivos[tivoIndex].mini;

    // update apps order
    var thisAppsOrder = config.tivos[tivoIndex].apps;
    apps_order = [];
    for (i = 0; i < thisAppsOrder.length; i++) {
        var tivoAppKey = thisAppsOrder[i];
        var tivoApp = apps[tivoAppKey];
        if (typeof tivoApp === 'undefined') {
            console.log("Invalid app: " + tivoAppKey);
            continue;
        }
        
        apps_order.push(tivoAppKey);
    }

    console.log("Currently controlling: " + currentTiVoBox + " (" + currentTiVoIP + ")");
}

// generate a list of channels defined in channels.json (for changing by channel name)
function createChannelList(genre) {

    speechList = "";
    cardList = "";
    channelName = "";
    var linecount = 0;

    console.log("building list of defined channels");
    console.log("Genre: " + genre);
    var names = [];
    for (channelName in channels) {
        if (linecount == 97) {
            console.log("Channel list is too long.");
            names.push(strings.txt_listtoolong);
            cardList = cardList + "\n\n\n" + strings.txt_listtoolong;
            return
        }
		
        if (channels[channelName].genre == genre) {
            linecount++;
            console.log(channels[channelName].name + " (" + channels[channelName].channel + ")");
            names.push(channels[channelName].pronounce);
            // uppercase the channel names for a consistent look on the card, and include channel number
            cardList = cardList + "\n- " + channels[channelName].name.toUpperCase() + " (" + channels[channelName].channel + ")";
        } else if (genres.indexOf(genre) < 0 | genre == "all") {
            linecount++;
            console.log(channels[channelName].name + " (" + channels[channelName].channel + ")");
            names.push(channels[channelName].pronounce);
            // uppercase the channel names for a consistent look on the card, and include channel number
            cardList = cardList + "\n- " + channels[channelName].name.toUpperCase() + " (" + channels[channelName].channel + ")";
        }
    }
    
    speechList = names.join(", ");
    
    console.log("speech list:\n " + speechList + "\ncard list: " + cardList);

}

// retrieve the specified user-defined macro and build command sequence
function processMacro(macroName, response) {

    var macroArray = "";
    var macroCommand = "";
    var waitDelay = 0;
    var commands = [];

    // confirm the requested macro exists in macros.json
    macroIndex = findMacro(macroName);

    if (macroIndex < 0) {
        // the requested macro doesn't exist in the macros file
        response.say(strings.txt_macronotfound + macroName + strings.txt_macronotfound2);
    }
    else {
        response.say("Executing macro " + macroName);
        console.log("Executing macro: " + macroName);
        macroArray = macros[macroIndex].commands.split(',');
        macroArrayCount = macroArray.length;

        // loop through the macro array to build the command sequence
        for (i = 0; i < macroArrayCount; i++) { 
            macroCommand = macroArray[i].trim(); 
            console.log("Command sequence " + i + ": " + macroCommand);
            // check for the SLEEP command (to pause execution)
            if (macroCommand.substring(0,4) == "WAIT") {
                waitDelay = macroCommand.split(" ")[1];
                // this is a hack for now: pad the command queue with MUTE commands
                // to 'simulate' a pause. MUTE doesn't/shouldn't do anything but
                // sending the commands keeps the connection from timing out.
                // The wait time is specified in seconds so convert that into an
                // appropriate number of IRCODE commands to send that will simulate
                // a pausing of the macro for that length of time. In testing, 3
                // IRCODE commands take approximately 1 second.
                waitDelay = parseInt(waitDelay) * 3;
                for (j = 0; j < waitDelay; j++) {
                    commands.push("MUTE");
                }
            }
            else {
                commands.push(macroCommand);
            }
        }

        // execute the macro
        sendCommands(commands);
    }

}

// find the index of the requested macro in the macros file
function findMacro(macroName) {

    console.log("Searching for '" + macroName +"' in macros file ...");
    for (i = 0; i < totalMacros; i++) {
        if (macros[i].name.toUpperCase() == macroName) {
            console.log("Found! (" + i + ")");
            return i;
        }
    }

    console.log("Not found!");
    return -1;
}


module.exports = app;
