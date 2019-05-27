pragma solidity ^0.5.0;

import "./SafeMath.sol";
import "./Pausable.sol";

contract RockPaperScissors is Pausable {

    using SafeMath for uint;

    event LogContractCreated (address indexed owner, uint indexed timeOutLimit);
    event LogTimeOutChanged (address indexed changer, uint indexed newTimeOutLimit);
    event LogNewGameCreated (address indexed player1, uint indexed buyIn, address indexed player2, uint expireTimeLeft);
    event LogPlayerTwoJoined (address indexed player2, uint revealTimeLeft, Move move2);
    event LogRevealedAndFinished (address indexed whoRevealed, Move move1, Move move2, uint indexed result);
    event LogGameTied (address indexed player1, uint player1Balance, address indexed player2, uint player2Balance);
    event LogGameWonBy(address indexed player, uint player1Balance);
    event LogGameRefreshed(address indexed player1, address indexed player2, uint indexed amount);
    event LogWithdrawWinnings(address indexed beneficiary, uint indexed amount);
    event LogGameCancelled(address indexed whoCancelled, uint playerOneBalance);
    event LogClaimedNoShow(address indexed whoClaimed, uint playerTwoBalance);

    enum Move { NONE, ROCK, PAPER, SCISSORS }
    
    uint public timeOutLimit; //works for both reveal time and expire time, is set accordingly
    uint constant MIN_TIME_LIMIT = 300; // minimum value for the timeLimit in seconds

   // A game session
    struct Game {
        uint buyInAmount;
        address player1;
        address player2;
        Move   move2;
        uint expireTime; 
    }

    // List of Game sessions indexed by a hash calculated from secret and first player move
    mapping(bytes32 => Game) public gamesList;

    mapping(address => uint256) public balances;
    
    constructor (bool _initialState, uint _timeOutLimit) Pausable(_initialState) public {
        require(_timeOutLimit >= MIN_TIME_LIMIT, "specified _timeOutLimit too less");
        timeOutLimit = _timeOutLimit;
        emit LogContractCreated(msg.sender, timeOutLimit);
    }
    
    function setTimeOutLimit (uint _timeOutLimit) public onlyOwner{
        require(timeOutLimit != _timeOutLimit,"New value should be different");
        require(_timeOutLimit >= MIN_TIME_LIMIT, "specified _timeOutLimit too less");
        timeOutLimit = _timeOutLimit;
        emit LogTimeOutChanged(msg.sender, timeOutLimit);
    }
    
    // get the hash for the move1
    function getGameHash (bytes32 _secret , Move _move1) public view returns(bytes32 hashedMove1){
        hashedMove1 =  keccak256(abi.encodePacked(_secret, _move1, address(this)));
    }
    
    // Player1 creates the game after obtaininh hash of the move and secret offline
    function createGame(bytes32 _hashedMove1, address _player2) public payable
    onlyIfAllowed onlyIfRunning returns (bool success){
        //Restricting duplicate moves by checking if the slot is empty
        require (gamesList[_hashedMove1].player1 == address(0), "This _hashedMove1 has already been used");
        
        Game memory newGame;
        newGame.buyInAmount = msg.value;
        newGame.player1 = msg.sender;
        newGame.player2 = _player2;
        newGame.expireTime = now.add(timeOutLimit); // Starting clock for expireTime if player2 doesn't join
        
        gamesList[_hashedMove1] = newGame;
        emit LogNewGameCreated(msg.sender, msg.value, _player2, newGame.expireTime);
        return true;
    }
    
    // Player2 joins the game using the hashed move of player1, before expiry time
    function joinGame(bytes32 _hashedMove1, Move _move2) public payable returns (bool success){
        
        require(_move2 != Move.NONE, "Please select a valid move first");
        
        Game storage newGame =  gamesList[_hashedMove1];
        require(newGame.player2 == msg.sender, "Wrong player");
        require(newGame.buyInAmount == msg.value, "Playing amount doesn't match!" );
        require(now < newGame.expireTime, "Game crossed deadline already");
        newGame.move2 = _move2;
        newGame.expireTime = now.add(timeOutLimit); // Starting clock for revealTime
        
        emit LogPlayerTwoJoined(msg.sender, newGame.expireTime, _move2);
        return true;
        
    }
    
    // Any external alarm service, not necessarily player1, can call to reveal first move
    function revealAndFinish(bytes32 _secret, Move _move1) public onlyIfRunning returns (bool success){
        
        require(_move1 != Move.NONE, "Please select a valid move first");
        // Reveal first move and validate
        bytes32 hashedMove1 =  getGameHash (_secret , _move1); 
        
        Game storage runningGame = gamesList[hashedMove1];
        require(now <= runningGame.expireTime, "Game crossed deadline already");
        
        // Get second move
        Move move2 = runningGame.move2;
        require(move2 != Move.NONE, "Player2 hasn't revealed yet");
        
        //  Result : (0, 1, 2 = Draw, Player1 winner, Player2 winner)
        uint result = whoWins(_move1, move2);
        emit LogRevealedAndFinished(msg.sender,_move1, move2, result);
        
        rewardWinner(runningGame, result); // Adjust balances
        
        return true;
    }
    
    // Rock-paper-scissors game logic
    function whoWins (Move _move1, Move _move2) internal returns (uint result){
        
        if (_move1 == _move2) result = 0;
        if (_move1 == Move.ROCK && _move2 == Move.PAPER) result = 2;
        if (_move1 == Move.ROCK && _move2 == Move.SCISSORS) result = 1;
        if (_move1 == Move.PAPER && _move2 == Move.ROCK) result = 1;
        if (_move1 == Move.PAPER && _move2 == Move.SCISSORS) result = 2;
        if (_move1 == Move.SCISSORS && _move2 == Move.PAPER) result = 1;
        if (_move1 == Move.SCISSORS && _move2 == Move.ROCK) result = 2;
    }
     
    // Settle balances based on result and free-up storage
    function rewardWinner (Game storage _finishedGame, uint result) internal {
        
        uint stake = _finishedGame.buyInAmount;
        address player1 = _finishedGame.player1;
        address player2 = _finishedGame.player2;
        
        // Updating balances based on result
        if (result == 0) {
                balances[player1] = balances[player1].add(stake);
                balances[player2] = balances[player2].add(stake);
                emit LogGameTied(player1, balances[player1], player2, balances[player2]);
            }
         else if (result == 1){
                balances[player1] = balances[player1].add(stake.mul(2));
                emit LogGameWonBy(player1, balances[player1]);
        } else {
                balances[player2] = balances[player2].add(stake.mul(2));
                emit LogGameWonBy(player2, balances[player2]);
        }
        
        refreshGame(_finishedGame);
        
    }
    
    // Being a good citizen and freeing up EVM storage
    function refreshGame(Game storage _finishedGame) internal {
        
        _finishedGame.buyInAmount = 0;
     //   _finishedGame.player1 = address(0); // Purposely commeneted as player1 is being checked in createGame for password reuse
        _finishedGame.player2 = address(0);
        _finishedGame.move2 = Move.NONE;
        _finishedGame.expireTime = 0;
        
        emit LogGameRefreshed(_finishedGame.player1, _finishedGame.player2, _finishedGame.buyInAmount);
    }
    
    // Players can withdraw winnings
    function withdrawWinnings() public onlyIfRunning{
        uint balance = balances[msg.sender];
        require(balance > 0, "Nothing to withdraw");
        balances[msg.sender] = 0;
        emit LogWithdrawWinnings (msg.sender, balance);
        msg.sender.transfer(balance);
    }
    
    // Cancel game if player2 did not join, can be called by anyone on behalf of player1 
    function cancelGame(bytes32 _hashedMove1) external{
        Game storage cancelGame = gamesList[_hashedMove1];
        require(cancelGame.expireTime > now);
        balances[cancelGame.player1] = balances[cancelGame.player1].add(cancelGame.buyInAmount);
        
        emit LogGameCancelled (msg.sender, balances[cancelGame.player1]);
        refreshGame(cancelGame);
    }
    
    // Claim winnings if player1 didn't reveal move, can be called by anyone on behalf of player2
    function claimNoShow(bytes32 _hashedMove1) external{
        Game storage claimGame = gamesList[_hashedMove1];
        require(claimGame.expireTime > now);
        balances[claimGame.player2] = balances[claimGame.player2].add(claimGame.buyInAmount.mul(2));
        
        emit LogClaimedNoShow (msg.sender, balances[claimGame.player2]);
        refreshGame(claimGame);
    }

    //fall-back function
    function() external {
        revert("Please check the function you are trying to call..");
    }
}
