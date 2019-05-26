pragma solidity ^0.5.0;

import "./Ownable.sol";

contract Pausable is Ownable{
    bool private isRunning;
    bool private isWindDown;
    
    event LogPausedContract(address sender);
    event LogResumedContract(address sender);
    event LogWindDown(address sender);
    
    modifier onlyIfRunning {
        require(isRunning);
        _;
    }
    
    modifier onlyIfPaused {
        require(!isRunning);
        _;
    }
    
    modifier onlyIfAllowed {
        require(!isWindDown);
        _;
    }
    
    constructor(bool _initialState) public{
        isRunning = _initialState;
        isWindDown = false;
    }

    function getIsRunning() public view returns(bool){
        return isRunning;
    }
    
    function getIsWindDown() public view returns(bool){
        return isWindDown;
    }
    
    //can be used to pause a contract temporarily or as needed
    function pauseContract() public onlyOwner onlyIfRunning returns (bool success){
        isRunning = false;
        emit LogPausedContract(msg.sender);
        return true;
    }
    
    //can be used to resume a contract back live from pausd state
    function resumeContract() public onlyOwner onlyIfPaused returns (bool success){
        isRunning = true;
        emit LogResumedContract(msg.sender);
        return true;
    }
    
    //can be used for something like pausing deposit while allowing only withdraw
    function windDown() public onlyOwner returns (bool success){
        isWindDown = true;
        emit LogWindDown(msg.sender);
        return true;
    }
    
    //delete or remove the contract if the need be
    function kill() external onlyOwner onlyIfPaused {
        selfdestruct(msg.sender); 
    }
}
