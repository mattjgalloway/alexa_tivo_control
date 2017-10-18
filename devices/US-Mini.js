var BaseDevice = require('../device');
var util = require('util');

function Device () {
  BaseDevice.apply(this, arguments);
}

util.inherits(Device, BaseDevice);

Device.prototype.openAppsCommands = function() {
  return ["TIVO", "DOWN", "DOWN", "DOWN", "RIGHT"];
}

Device.prototype.openAppForKeyCommands = function(appKey) {
  var loc = this.appsOrder.indexOf(appKey);

  var commands = [];
  for (var i = 1; i <= loc; i++) {
    commands.push("DOWN");
  }
  commands.push("RIGHT");
  
  return commands;
}

Device.prototype.whatToWatchCommands = function() {
  return ["TIVO", "DOWN", "DOWN", "RIGHT"];
}

Device.prototype.searchCommands = function(string) {
  var commands = [];
  commands.push("TIVO");
  commands.push("NUM4");
  Array.prototype.push.apply(commands, this.typeCommands(string));
  return commands;
}

Device.prototype.setChannelCommands = function(channel) {
  var commands = [];
  for (var pos = 0 ; pos < channel.length ; pos++) {
    commands.push("NUM" + channel.substring(pos,pos+1));
  }
  commands.push("ENTER");
  return commands;
}

Device.prototype.forceChannelCommands = function(channel) {
  return this.setChannelCommands(channel);
}

module.exports = Device;
