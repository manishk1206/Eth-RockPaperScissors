const Remittance = artifacts.require("RockPaperScissors");

module.exports = function(deployer) {
  deployer.deploy(RockPaperScissors, true, 300); //  _initialState = true i.e running, _timeOutLimit = 5 mins = 300 seconds
};
