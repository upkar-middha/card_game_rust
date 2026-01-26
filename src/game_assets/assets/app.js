// broad start game event to set up the UI here
// number of cards not event broadcasted too along with seat
// reset moved to end game , so that player can click ready again 
let player_id = null;
let seats = [];
let hand = [];
const protocol = window.location.protocol === "https:" ? "wss" : "ws";
const ws_url = `${protocol}://${window.location.host}/ws`;

const socket = new WebSocket(ws_url);

socket.onopen = () => {
    console.log("connected to server");
    // maybe load an front page with name option and start game option
}

socket.onmessage = (event) => {
    const msg =     JSON.parse(event.data);
    handle_server_event(msg);
}

socket.onclose = () => {
    // maybe i can send a action even if its closed ? like a last good bye action ?
    console.log("see ya");
}

function handle_server_event(msg) {
    switch(msg.type) {
        case "Id" :
            if (player_id != null) {
                console.log("player id is already assigned");
                return;
            }
            player_id = msg.p_id;
            break;
        
        case "Hand" : 
            if (hand.length != 0) {
                console.log("player alread has been assigned cards");
                return;
            }
            hand = msg.cards;
            break;

        case "SeatOrder" : 
            if (seats.length != 0) {
                console.log("seats has been assigned");
                return;
            }
            seats = msg.seats
            rotate_seats(player_id); // rotates array so that you are at first index
            break;
        
        case "StartGame" :
            // load table , seats 
            break;

        case "NextTurn" :
            let id = msg.player_id;
            // highlight player with id on table; make card play button unclickable if not your turn
            break;
        
        case "DiscardPile" :
            // clear the table and move cards to another area
            break;
        case "FoulGiven" :
            break;

        case "PlayerWon" :
            id = msg.player_id;
            //show winner on this id
            break;

        case "InvalidCard" :
            id = msg.p_id;
            // if you are the player , give a warning on screen that the card is invalid
            break;

        case "PlayerLeft" :
            //show a message on screen that a player left
            break;

        case "SpecialEvent" :
            let from = msg.p_id;
            let to = msg.to;
            let card = msg.card;
            // add this card to your deck if you are the player receiving , else if you are the giver , remove that card from your side and give
            // it to player of from id , else just show on screen the message that the card has been added to this player , incrementing their count
            break;

        case "EndGame" :
            id = msg.p_id;
            // shows loosers id and maybe also an end game screen
            // for now move back to homescreen and show loosers name there
            break;

        case "CardPlayed" :
            id = msg.p_id;
            card = msg.card;
            // if this is your id , remove this card from hand , else show removal of card corresponding to the player id
            break;

        case "InvalidPlayer" :
            // do some action
    }
}

function rotate_seats(player_id) {
    const idx = seats.findIndex(s => s === player_id);
    seats = seats.slice(idx).concat(seats.slice(0 , idx));
}

