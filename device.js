var apps = require("./apps.json");

function Device (name, ip, port, appsOrder) {
  this.name = name;
  this.ip = ip;
  this.port = port;
  this.appsOrder = appsOrder;
}

Device.prototype.checkAppEnabled = function(appKey) {
  console.log("checking status of app (" + appKey + ")");
  
  var enabled = this.appsOrder.indexOf(appKey) >= 0;
  
  if (enabled) {
    console.log("- enabled");
  } else {
    console.log("- disabled");
  }
  
  return enabled;
}

Device.prototype.createAppList = function() {
  var speechList = "";
  var cardList = "";
  
  console.log("building list of apps");
  var names = [];
  for (loc = 0; loc < this.appsOrder.length; loc++) {
    var tivoAppKey = this.appsOrder[loc];
    var tivoApp = apps[tivoAppKey];
    names.push(tivoApp.name);
    cardList = cardList + "\n- " + tivoApp.name;
  }
  
  speechList = names.join(", ");
  
  console.log("speech list:\n " + speechList + "\ncard list: " + cardList);
  
  return {"speech": speechList, "card": cardList};
}

Device.prototype.typeCommands = function(string) {
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

Device.prototype.setChannelCommands = function(channel) {
  return ["SETCH " + channel];
}

Device.prototype.forceChannelCommands = function(channel) {
  return ["FORCECH " + channel];
}

module.exports = Device;
