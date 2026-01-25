A turn based online multiplayer card game prototype with authorative server model.

# Game Rules
+ Every player is given a set of random cards and the first turn is decided by the person holding Ace of spade.
+ It is mandatory to play Ace of space as the first card , After that player who gets the turn can play whatever card they would like to play.
+ If someone has played a card ,and now it's your turn , you must have to play the card of same suit (if you have any card of that suit in your hand)
+ if you dont have that particular suit , you can play any card from your hand , all the cards that have been played in current turn are given as a foul to the player who has played the highest value card and turn is transferred to that player.
+ if everyone played form the same suit , then the turn will be decided by the player who has played the highest value card and current pile is discarded , then the player  will play any card of from their hand.
+ last player standing looses the game.

# Working

+ Communication is being done by using webSockets as they are easy to use and sufficient for a turn based event driven game. I have used Axum crate for communication between client and server.
+ Using async functions with the help of tokio crate to manage websockets.
+ Players can send 3 type of Actions : Ready , CardPlayed and Endgame
+ When everyone marks ready , game is started automatically , send each player hand , its id as a private msg , subsequent messages are broadcasted to each client during the game.
+ If a player leaves game is aborted instantly.
+ Server send Events to all the clients and based on those events updation happens on the client side , client can not make decision on there own.
+ There are number of Events like cardPlayed , NextTurn , Foul , winner , endgame , etc
  
