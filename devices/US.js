var BaseDevice = require('../device');
var util = require('util');

function Device () {
  BaseDevice.apply(this, arguments);
}

util.inherits(Device, BaseDevice);

Device.prototype.openAppsCommands = function() {
  return ["TIVO", "DOWN", "DOWN", "RIGHT"];
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
  return ["TIVO", "DOWN", "RIGHT"];
}

Device.prototype.searchCommands = function(string) {
  var commands = [];
  commands.push("TIVO");
  commands.push("NUM4");
  Array.prototype.push.apply(commands, this.typeCommands(string));
  return commands;
}

module.exports = Device;
