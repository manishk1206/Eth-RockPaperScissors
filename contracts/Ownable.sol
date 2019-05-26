pragma solidity ^0.5.0;

contract Ownable{
    
    address private owner;
    
    event LogChangeOwner(address indexed sender, address indexed newOwner);
    
    modifier onlyOwner{
        require(msg.sender==owner);
        _;
    }
    
    constructor() public{
        owner = msg.sender;
    }
    
    function getOwner() public view returns(address){
        return owner;
    }
    
    function changeOwner(address newOwner) public onlyOwner returns(bool success){
        require(newOwner != address(0));
        owner = newOwner;
        emit LogChangeOwner(msg.sender,newOwner);
        return true;
        
    }
    
}
