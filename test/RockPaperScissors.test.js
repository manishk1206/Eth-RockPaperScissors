const RockPaperScissors = artifacts.require("RockPaperScissors");
const truffleAssert = require('truffle-assertions');
const helper = require("./helpers/timeTravelHelper");

const { toBN , toWei } = web3.utils;

contract("RockPaperScissors contract main test cases", accounts => {
    const [owner, account1, account2, account3, account4] = accounts;
    const Move = [ "NONE", "ROCK", "PAPER", "SCISSORS" ];
    let instance;

    beforeEach('Deploying fresh contract instance before each test', async function () {
        instance = await RockPaperScissors.new(true, 600, {from:owner}); // 600 is  timeOutLimit of 10 min in seconds
    })

    describe("Testing CREATE Game Functionality", () => {

        it("should not allow duplicate moves(passwords)", async () => {
            //Transaction1
            await instance.createGame("SamePassword123",account2, { from: account1, value: 10 });
            // Transaction2 trying to use same pwd
            await truffleAssert.fails(
            instance.createGame("SamePassword123",account4, { from: account3, value: 15 })
            );
        });

        it("should be able to CREATE game", async () => {
            //Creating a game and capturing the transaction object
            const txObj = await instance.createGame("asdf123", account2, { from: account1, value: 10 });
            // Check if transaction status is true
            assert.isTrue(txObj.receipt.status, "Transaction failed..Could not create game");
            // check if event was emitted
            const event = getEventResult(txObj, "LogNewGameCreated");
            assert.isDefined(event, "it should emit LogNewGameCreated");
            // Check if the game session was created with correct data
            let gameSession = await instance.gamesList.call("asdf123");
            assert.strictEqual(gameSession.buyInAmount.toString(), "10", "amount not valid");
            assert.strictEqual(gameSession.player1.toString(),account1.toString(), "player1 not valid");
            assert.strictEqual(gameSession.player2.toString(),account2.toString(), "player2 not valid");
            });
    });

    describe("Testing JOIN Game Functionality", () => {

        it("Revert invalid attempts to join created game", async () => {
            // creating a game first
            await instance.createGame("asdf123", account2, { from: account1, value: 10 });
            //invalid attempts to join games as follows
            await truffleAssert.fails(
            instance.joinGame("asdf123", Move.NONE, { from: account2, value: 10 }, "Should play a valid move")
            );
            await truffleAssert.fails(
            instance.joinGame("asdf123", Move.ROCK, { from: account3, value: 10 }, "Should be called by player2 only")
            );
            await truffleAssert.fails(
            instance.joinGame("asdf123", Move.ROCK, { from: account2, value: 9 }, "Buy-in amount is different from player1")
            );
        });

        it("should NOT allow to join after deadline", async () => {
            // creating a game first
            await instance.createGame("asdf123", account2, { from: account1, value: 10 });
            //Passing time more than timeOutLimit
            await helper.advanceTime(15 * 60); //15 min later
            // Trying to join game, should fail
            await truffleAssert.fails(
            instance.joinGame("asdf123", Move.ROCK, { from: account2, value: 10 }, "Deadline to join the game has passed")
            );
        });

        it("should allow to join before deadline", async () => {
            // creating a game first
            await instance.createGame("asdf123", account2, { from: account1, value: 10 });
            //Passing time less than timeOutLimit
            await helper.advanceTime(5 * 60); //5 min later
            // Trying to join game
            const txObj = await instance.joinGame("asdf123", Move.ROCK, { from: account2, value: 10 });
            // Check if transaction status is true
            assert.isTrue(txObj.receipt.status, "Transaction failed..Could not join game");
            // check if event was emitted
            const event = getEventResult(txObj, "LogPlayerTwoJoined");
            assert.isDefined(event, "it should emit LogPlayerTwoJoined");
            // Check if the game session was joined with correct data
            let gameSession = await instance.gamesList.call("asdf123");
            assert.strictEqual(gameSession.move2.toString(), "Move.ROCK", "Move2 not set");
            });
        });
    });

    describe("Testing REVEAL and FINISH Game Functionality", () => {

        it("should NOT allow to reveal after deadline", async () => {
            const secret = "aBc123xYz";
            // Creating hashedMove1 from secret and move1
            let hashedMove1 = await instance.getGameHash(secret, Move.PAPER).call();
            // Player1 creates a game
            await instance.createGame(hashedMove1, account2, { from: account1, value: 10 });
            // Player2 Joins
            await instance.joinGame(hashedMove1, Move.ROCK, { from: account2, value: 10 });
            //Passing time more than timeOutLimit
            await helper.advanceTime(15 * 60); //15 min later
            // Player1 trying to reveal, should fail
            await truffleAssert.fails(
            instance.revealAndFinish(secret, Move.PAPER, { from: account1 }, "Deadline to reveal the move has passed")
            );
        });

        it("should allow to reveal before deadline", async () => {
            const secret = "aBc123xYz";
            // Creating hashedMove1 from secret and move1
            let hashedMove1 = await instance.getGameHash(secret, Move.PAPER).call();
            // Player1 creates a game
            await instance.createGame(hashedMove1, account2, { from: account1, value: 10 });
            // Player2 Joins
            await instance.joinGame(hashedMove1, Move.ROCK, { from: account2, value: 10 });
            //Passing time less than timeOutLimit
            await helper.advanceTime(5 * 60); //5 min later
            // Player1 trying to reveal
            const txObj = await instance.revealAndFinish(secret, Move.PAPER, { from: account1 });
            // Check if transaction status is true
            assert.isTrue(txObj.receipt.status, "Transaction failed..Could not reveal the move1")
            // check if event was emitted
            const event = getEventResult(txObj, "LogRevealedAndFinished");
            assert.isDefined(event, "it should emit LogRevealedAndFinished");
        });

        it("should finish the game and update balances correctly for winner", async () => {
            const secret = "aBc123xYz";
            const buyIn = toWei('10', 'Gwei');
            // Creating hashedMove1 from secret and move1
            let hashedMove1 = await instance.getGameHash(secret, Move.PAPER).call();

            //Checking balances of both players before the game
            const preBalance1 = await instance.balances.call(account1);
            const preBalance2 = await instance.balances.call(account2);

            // Player1 creates a game
            await instance.createGame(hashedMove1, account2, { from: account1, value: buyIn });
            // Player2 Joins
            await instance.joinGame(hashedMove1, Move.SCISSORS, { from: account2, value: buyIn });
            // Player1 reveals
            await instance.revealAndFinish(secret, Move.PAPER, { from: account1 });
            // Since _move1 =PAPER && _move2 = ROCK , move1 wins i.e player1 should win
            const expectedBalance1 = toBN(preBalance1).add(toBN(buyIn).mul(2));

            // Checking balance for both players after the game
            const postBalance1 = await instance.balances.call(account1);
            const postBalance2 = await instance.balances.call(account2);
            assert.strictEqual(postBalance1.toString(), expectedBalance1.toString(), "Player1 does not have the correct balance after winning.");
            assert.strictEqual(postBalance2.toString(), preBalance2.toString(), "Player2 balance should be unchanged as they lost.");
        });
    });

    describe("Testing WITHDRAW Functionality", () => {

        it("should NOT allow withdrawal to wrong account", async () => {
            const secret = "aBc123xYz";
            const buyIn = toWei('10', 'Gwei');
            // Creating hashedMove1 from secret and move1
            let hashedMove1 = await instance.getGameHash(secret, Move.PAPER).call();
            // Player1 creates a game
            await instance.createGame(hashedMove1, account2, { from: account1, value: buyIn });
            // Player2 Joins
            await instance.joinGame(hashedMove1, Move.SCISSORS, { from: account2, value: buyIn });
            // Player1 reveals
            await instance.revealAndFinish(secret, Move.PAPER, { from: account1 });
            // Trying to withdraw using player2 when player 1 has won, should fail
            await truffleAssert.fails(
            instance.withdrawWinnings({ from: account2 }, "Can't withdraw, player2 lost the game.")
            );

        });

        it("should allow withdrawal to correct account", async () => {
            const secret = "aBc123xYz";
            const buyIn = toWei('10', 'Gwei');
            // Creating hashedMove1 from secret and move1
            let hashedMove1 = await instance.getGameHash(secret, Move.PAPER).call();
            // Player1 creates a game
            await instance.createGame(hashedMove1, account2, { from: account1, value: buyIn });
            // Player2 Joins
            await instance.joinGame(hashedMove1, Move.SCISSORS, { from: account2, value: buyIn });
            // Player1 reveals
            await instance.revealAndFinish(secret, Move.PAPER, { from: account1 });
            // player 1 has won, should be allowed to withdraw
            const txObj = await instance.withdrawWinnings({ from: account1 });
            // Check if transaction status is true
            assert.isTrue(txObj.receipt.status, "Transaction failed..Could not withdraw")
            // check if event was emitted
            const event = getEventResult(txObj, "LogWithdrawWinnings");
            assert.isDefined(event, "it should emit LogWithdrawWinnings");
        });
    });

    describe("Testing CANCEL Functionality", () => {

        it("should NOT allow to cancel before expire time", async () => {
            const secret = "aBc123xYz";
            const buyIn = toWei('10', 'Gwei');
            // Creating hashedMove1 from secret and move1
            let hashedMove1 = await instance.getGameHash(secret, Move.PAPER).call();
            // Player1 creates a game
            await instance.createGame(hashedMove1, account2, { from: account1, value: buyIn });
            // Passing time less than timeOutLimit
            await helper.advanceTime(5 * 60); //5 min later
            // Player1 tries to cancel, should fail
            await truffleAssert.fails(
            instance.cancelGame(hashedMove1, { from: account1 }, "Can't cancel, its early.")
            );
        });

        it("should allow to cancel after expire time and update balance of player1", async () => {
            const secret = "aBc123xYz";
            const buyIn = toWei('10', 'Gwei');
            // Creating hashedMove1 from secret and move1
            let hashedMove1 = await instance.getGameHash(secret, Move.PAPER).call();
            //Checking balance of  player1 before the game
            const preBalance1 = await instance.balances.call(account1);
            // Player1 creates a game
            await instance.createGame(hashedMove1, account2, { from: account1, value: buyIn });
            // Passing time more than timeOutLimit
            await helper.advanceTime(15 * 60); //15 min later
            // Player2 did not join still
            // Player1 tries to cancel, should cancel and add the stake amount to player1 balance
            await instance.cancelGame(hashedMove1, { from: account1 });
            // Checking balance for player1 after the game
            const postBalance1 = await instance.balances.call(account1);
            const expectedBalance1 = toBN(preBalance1).add(toBN(buyIn));
            assert.strictEqual(postBalance1.toString(), expectedBalance1.toString(), "Player1 does not have the correct balance after cancel.");
        });
    });

    describe("Testing CLAIM Functionality", () => {

        it("should NOT allow to claim before expire time", async () => {
            const secret = "aBc123xYz";
            const buyIn = toWei('10', 'Gwei');
            // Creating hashedMove1 from secret and move1
            let hashedMove1 = await instance.getGameHash(secret, Move.PAPER).call();
            // Player1 creates a game
            await instance.createGame(hashedMove1, account2, { from: account1, value: buyIn });
            // Player2 Joins
            await instance.joinGame(hashedMove1, Move.SCISSORS, { from: account2, value: buyIn });
            // Passing time less than timeOutLimit
            await helper.advanceTime(5 * 60); //5 min later
            // Player2  tries to claim, should fail
            await truffleAssert.fails(
            instance.claimNoShow(hashedMove1, { from: account2 }, "Can't claim, its early.")
            );
        });

        it("should allow to claim after expire time and update balance of player1", async () => {
            const secret = "aBc123xYz";
            const buyIn = toWei('10', 'Gwei');
            // Creating hashedMove1 from secret and move1
            let hashedMove1 = await instance.getGameHash(secret, Move.PAPER).call();
            //Checking balance of  player2 before the game
            const preBalance2 = await instance.balances.call(account2);
            // Player1 creates a game
            await instance.createGame(hashedMove1, account2, { from: account1, value: buyIn });
            // Player2 Joins
            await instance.joinGame(hashedMove1, Move.SCISSORS, { from: account2, value: buyIn });
            // Passing time more than timeOutLimit
            await helper.advanceTime(15 * 60); //15 min later
            // Player1 did not reveal still
            // Player2 tries to claim, should claim and add both the stake amount to player2 balance
            await instance.claimNoShow(hashedMove1, { from: account2 });
            // Checking balance for player2 after the game
            const postBalance2 = await instance.balances.call(account2);
            const expectedBalance2 = toBN(preBalance2).add(toBN(buyIn).mul(2));
            assert.strictEqual(postBalance2.toString(), expectedBalance2.toString(), "Player2 does not have the correct balance after claim.");
        });
    });