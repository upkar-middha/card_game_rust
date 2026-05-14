//
// ======================================================
// STATE
// ======================================================
//
const players = new Map();
let player_id = null;
let current_room_id = null;
let room_id = null; //-------------------------------------------------- u32
let is_ready = false;
let game_started = false;
let game_over = false;
let last_clicked_card = null; // ----------------------------------- added
let current_turn_player = null;
let awaiting_play_response = false; //-----------------------------
let toastTimeout = null;
let discardTimeout = null;

let hand = [];

let seats = []; // [{ id, count }]
let pile = [];



//
// ======================================================
// DOM
// ======================================================
//

const connectScreen =
    document.getElementById("screen-connect");

const roomScreen =
    document.getElementById("screen-room");

const gameScreen =
    document.getElementById("screen-game");

const endScreen =
    document.getElementById("screen-end");



const nameInput =
    document.getElementById("nameInput");

const roomIdInput =
    document.getElementById("roomIdInput");



const setNameBtn =
    document.getElementById("setNameBtn");

const createRoomBtn =
    document.getElementById("createRoomBtn");

const joinRoomBtn =
    document.getElementById("joinRoomBtn");

const readyBtn =
    document.getElementById("readyBtn");

const leaveRoomBtn =
    document.getElementById("leaveRoomBtn");

const playAgainBtn =
    document.getElementById("playAgainBtn");



const connectStatus =
    document.getElementById("connectStatus");

const roomStatus =
    document.getElementById("roomStatus");



const roomIdText =
    document.getElementById("roomIdText");

const playerCountText =
    document.getElementById("playerCountText");



const handDiv =
    document.getElementById("hand");

const opponentsDiv =
    document.getElementById("opponents");

const pileDiv =
    document.getElementById("pile");



const turnText =
    document.getElementById("turnText");

const gameRoomId =
    document.getElementById("gameRoomId");



const endTitle =
    document.getElementById("endTitle");

const endMessage =
    document.getElementById("endMessage");



//
// ======================================================
// CARD HELPERS
// ======================================================
//

const RANK_TO_FILENAME = {
    Ace: "ace",
    Two: "2",
    Three: "3",
    Four: "4",
    Five: "5",
    Six: "6",
    Seven: "7",
    Eight: "8",
    Nine: "9",
    Ten: "10",
    Jack: "jack",
    Queen: "queen",
    King: "king"
};

const SUIT_TO_FILENAME = {
    Diamond: "diamonds",
    Spade: "spades",
    Club: "clubs",
    Heart: "hearts"
};

const CARD_IMG_BASE =
    "/assets/Playing Cards/Playing Cards/PNG-cards-1.3";



function card_to_filename(card) {

    const rank =
        RANK_TO_FILENAME[card.rank];

    const suit =
        SUIT_TO_FILENAME[card.suit];

    if (!rank || !suit) {

        console.error(
            "Unknown card",
            card
        );

        return "";
    }

    return `${rank}_of_${suit}.png`;
}


function suit_order(suit) {

    switch (suit) {

        case "Spade":
            return 0;

        case "Heart":
            return 1;

        case "Diamond":
            return 2;

        case "Club":
            return 3;

        default:
            return 99;
    }
}



function rank_order(rank) {

    switch (rank) {

        case "Two":   return 2;
        case "Three": return 3;
        case "Four":  return 4;
        case "Five":  return 5;
        case "Six":   return 6;
        case "Seven": return 7;
        case "Eight": return 8;
        case "Nine":  return 9;
        case "Ten":   return 10;

        case "Jack":
            return 11;

        case "Queen":
            return 12;

        case "King":
            return 13;

        case "Ace":
            return 14;

        default:
            return 0;
    }
}

//
// ======================================================
// SCREEN HELPERS
// ======================================================
//

function show_screen(screen) {
    // List all your screen variables
    const allScreens = [connectScreen, roomScreen, gameScreen, endScreen];

    allScreens.forEach(s => {
        // 1. Remove active to trigger the fade out
        s.classList.remove("active");
        // 2. Add hidden to pull it out of the layout
        s.classList.add("hidden");
    });

    // 3. Remove hidden from the target so it's "there"
    screen.classList.remove("hidden");
    
    // 4. Use a tiny timeout so the browser notices the class change, 
    // allowing the opacity transition to actually play.
    setTimeout(() => {
        screen.classList.add("active");
    }, 10);
}

function render_player_list() {

    const playerListDiv =
        document.getElementById("playerList");

    if (!playerListDiv) return;

    playerListDiv.innerHTML = "";

    playerCountText.textContent =
        players.size;

    players.forEach((player, id) => {

        const card =
            document.createElement("div");

        card.className = "player-card";

        if (player.ready) {

            card.classList.add("player-ready");

            card.textContent =
                `${player.name} - READY ✓`;

        } else {

            card.textContent =
                player.name;
        }

        playerListDiv.appendChild(card);
    });
}



//
// ======================================================
// WEBSOCKET
// ======================================================
//

const ws =
    new WebSocket(
        `ws://${window.location.host}/ws`
    );



ws.onopen = () => {

    console.log("connected");

    connectStatus.textContent =
        "Connected. Waiting for server...";
};



ws.onerror = (err) => {

    console.error("ws error", err);

    connectStatus.textContent =
        "Connection error";
};



ws.onclose = () => {

    console.log("disconnected");

    connectStatus.textContent =
        "Disconnected";
};



ws.onmessage = (event) => {

    const msg =
        JSON.parse(event.data);

    console.log("←", msg);

    handle_server_message(msg);
};



//
// ======================================================
// SERVER MESSAGE HANDLER
// ======================================================
//

function handle_server_message(msg) {

    //
    // Connected
    //

    if (msg.Connected) {

        player_id =
            msg.Connected.p_id;

        connectStatus.textContent =
            `Connected as Player ${player_id}`;

        createRoomBtn.disabled = true;
        joinRoomBtn.disabled = true;

        return;
    }



    //
    // NameRegistered
    //

    if (msg === "NameRegistered") {

        connectStatus.textContent =
            "Name registered";
        createRoomBtn.disabled = false;
        joinRoomBtn.disabled = false;
        return;
    }



    //
    // RoomCreated
    //

    if (msg.RoomCreated) {

        current_room_id =
            msg.RoomCreated.r_id;

        //
        // backend does not auto join creator yet
        //

        send({
            InterfaceRequest: {
                JoinRoom: {
                    r_id: current_room_id
                }
            }
        });

        return;
    }



    //
    // RoomJoined
    //

    if (msg.RoomJoined) {

        current_room_id =
            msg.RoomJoined.r_id;

        roomIdText.textContent =
            current_room_id;

        gameRoomId.textContent =
            current_room_id;

        roomStatus.textContent =
            "Joined room";

        show_screen(roomScreen);

        return;
    }



    //
    // Event
    //

    if (msg.Event) {

        handle_event(msg.Event);

        return;
    }



    //
    // PrivateMsg
    //

    if (msg.PrivateMsg) {

        handle_private_message(
            msg.PrivateMsg
        );

        return;
    }



    //
    // Error
    //

    if (msg.Error) {

        connectStatus.textContent =
            msg.Error.err;

        return;
    }
}



//
// ======================================================
// EVENT HANDLER
// ======================================================
//

function handle_event(event) {
    let type;
    let data;

    // Fix for the "0 S" bug: handles both string and object events
    if (typeof event === "string") {
        type = event;
        data = null;
    } else {
        type = Object.keys(event)[0];
        data = event[type];
    }

    console.log("EVENT:", type, data);

    switch (type) {
        case "StartGame":
            if (game_started) return;
            game_started = true;
            show_screen(gameScreen);
            
            // Re-render everything once screen is visible
            render_hand();
            render_opponents();
            update_turn_ui();
            break;

        case "PlayerAdded":

            // ignore yourself
            if (data.p_id === player_id) {
                break;
            }

            roomStatus.textContent = `${data.name} joined`;

            players.set(
                data.p_id,
                {
                    name: data.name,
                    ready: false
                }
            );

            render_player_list();

            break;

            //show player name who left , fixed!
        case "PlayerLeft": {

            const player =
                players.get(data.p_id);

            const name =
                player
                    ? player.name
                    : `Player ${data.p_id}`;

            roomStatus.textContent =
                `${name} left`;

            players.delete(data.p_id);

            render_player_list();

            break;
        }

        case "MarkReady": {

            const player =
                players.get(data.p_id);

            if (player) {
                player.ready = true;
            }
            if (data.p_id === player_id) {

                is_ready = true;

                readyBtn.disabled = true;

                roomStatus.textContent = "You are ready";
            }

            render_player_list();

            break;
        }

        case "SeatOrder": {
            console.log("Processing SeatOrder. My ID:", player_id, "Data:", data);

            // 1. Combine IDs and Card Counts into one list
            const zipped = data.seats.map((id, i) => ({
                id: Number(id),
                count: data.counts[i]
            }));

            // 2. Find your position in that list
            const idx = zipped.findIndex(p => p.id === player_id);

            if (idx === -1) {
                console.error("I am not in the seat list!", player_id, zipped);
                return;
            }

            // 3. SLICING LOGIC: Rotate the array so YOU (idx) are at index 0
            // Everything from you to the end + everything from the start to you
            seats = zipped.slice(idx).concat(zipped.slice(0, idx));

            playerCountText.textContent = seats.length;
            render_opponents();
            break;
        }

        case "NextTurn":

            current_turn_player =
                data.player_id;

            if (current_turn_player === player_id) {

                awaiting_play_response = false;

                set_play_enabled(true);

            } else {

                set_play_enabled(false);
            }

            update_turn_ui();
            break;

        case "CardPlayed": {
            if (discardTimeout) {
                clearTimeout(discardTimeout);
                discardTimeout = null;
            }
            const { card, p_id } = data;
            pile.push(card);
            render_pile(card);
            update_player_count(p_id, -1);

            if (p_id === player_id) {
                remove_card_from_hand(card);
            }
            render_opponents();
            break;
        }

        case "FoulGiven": {
            const { to, cards } = data;
            update_player_count(to, cards.length);
            if (to === player_id) {
                hand = hand.concat(cards);
                render_hand();
            }
            render_opponents();
            show_toast(`Player ${to} received foul`);
            break;
        }

        case "PlayerWon":
            roomStatus.textContent = `Player ${data.player_id} won`;
            highlight_winner(data.player_id);
            break;

        case "DiscardPile":
            if (discardTimeout) clearTimeout(discardTimeout);
            discardTimeout = setTimeout(() => {
                pile = [];
                clear_pile();
                discardTimeout = null;
            }, 1000);
            break;

        case "EndGame":
            if (game_over) return;
            game_over = true;
            show_end_game_screen(data.p_id);
            break;

        case "Error":

            show_toast(data.message);

            break;

        default:
            console.warn("Unhandled event", type, data);
    }
}


//
// ======================================================
// PRIVATE MESSAGE HANDLER
// ======================================================
//

function handle_private_message(msg) {

    const type =
        Object.keys(msg)[0];

    const data =
        msg[type];

    console.log(
        "PRIVATE:",
        type,
        data
    );



    switch (type) {

        //
        // Hand
        //

        case "Hand":

            hand = data.cards;

            render_hand();

            break;



        //
        // SnapShot
        //

        case "SnapShot": {
            players.clear();
            for (let i = 0; i < data.p_ids.length; i++) {
                // We store as objects to keep 'ready' state and 'name' together
                players.set(data.p_ids[i], { 
                    name: data.names[i], 
                    ready: false // Default to false, MarkReady will update it
                });
            }
            render_player_list(); 
            if (game_started) render_opponents(); 
            break;
        }



        //
        // InvalidCard
        //

        case "InvalidCard":

            awaiting_play_response = false;
            if (last_clicked_card) {

                last_clicked_card.classList.add(
                    "invalid-card"
                );

                setTimeout(() => {

                    last_clicked_card.classList.remove(
                        "invalid-card"
                    );

                }, 500);
            }

            break;


        default:

            console.warn(
                "Unhandled private msg",
                type,
                data
            );
    }
}



//
// ======================================================
// SEND HELPERS
// ======================================================
//

function send(data) {

    if (
        ws.readyState !==
        WebSocket.OPEN
    ) {

        console.warn(
            "socket not open"
        );

        return;
    }

    ws.send(
        JSON.stringify(data)
    );

    console.log("→", data);
}



//
// ======================================================
// BUTTONS
// ======================================================
//

setNameBtn.onclick = () => {

    const name =
        nameInput.value.trim();

    if (!name) {
        return;
    }

    send({
        InterfaceRequest: {
            SetName: {
                name
            }
        }
    });
};



createRoomBtn.onclick = () => {

    send({
        InterfaceRequest:
            "CreateRoom"
    });
};



joinRoomBtn.onclick = () => {

    const r_id =
        Number(
            roomIdInput.value
        );

    if (!r_id) {
        return;
    }

    send({
        InterfaceRequest: {
            JoinRoom: {
                r_id
            }
        }
    });
};



readyBtn.onclick = () => {

    if (is_ready) {
        return;
    }

    send({
        Action: {
            action: "Ready"
        }
    });
};



leaveRoomBtn.onclick = () => {

    if (!current_room_id) {
        return;
    }

    send({
        InterfaceRequest: {
            LeaveRoom: {
                r_id:
                    current_room_id
            }
        }
    });

    show_screen(connectScreen);
};





playAgainBtn.onclick = () => {

    game_over = false;

    readyBtn.disabled = false;

    for (const player of players.values()) {
        player.ready = false;
    }

    render_player_list();

    roomStatus.textContent =
        "Back in lobby";

    show_screen(roomScreen);
};



//
// ======================================================
// GAME ACTIONS
// ======================================================
//

function play_card(card, element) {
    if (awaiting_play_response) {
            return;
        }

    awaiting_play_response = true;
    last_clicked_card = element;
    
    send({
        Action: {
            action: {
                CardPlayedByPlayer: {
                    card
                }
            }
        }
    });
}



//
// ======================================================
// RENDER HAND
// ======================================================
//

function render_hand() {

    handDiv.innerHTML = "";
    hand.sort((a, b) => {

    const suitDiff =
        suit_order(a.suit)
        - suit_order(b.suit);

    if (suitDiff !== 0) {
        return suitDiff;
    }

    return (
        rank_order(a.rank)
        - rank_order(b.rank)
    );
});
    for (const card of hand) {

        const img =
            document.createElement("img");

        img.className =
            "card";

        img.src =
            `${CARD_IMG_BASE}/${card_to_filename(card)}`;

        img.alt =
            `${card.rank} of ${card.suit}`;

        img.draggable = false;

        img.onclick = () => {

            play_card(card, img);
        };

        handDiv.appendChild(img);
    }
}



//
// ======================================================
// RENDER OPPONENTS
// ======================================================
//

function render_opponents() {

    opponentsDiv.innerHTML = "";

    for (
        let i = 1;
        i < seats.length;
        i++
    ) {

        const {
            id,
            count
        } = seats[i];

        const seat =
            document.createElement("div");

        seat.className =
            "opponent";

        seat.dataset.playerId =
            id;



        const name =
            document.createElement("div");

        name.className =
            "opponent-name";

        name.textContent =
            get_player_name(id);



        const cards =
            document.createElement("div");

        cards.className =
            "opponent-cards";



        for (
            let c = 0;
            c < count;
            c++
        ) {

            const back =
                document.createElement("div");

            back.className =
                "opponent-card";

            cards.appendChild(back);
        }

        seat.appendChild(name);
        seat.appendChild(cards);

        opponentsDiv.appendChild(seat);
    }

    highlight_active_player();
}



//
// ======================================================
// TURN UI
// ======================================================
//

function update_turn_ui() {

    const is_my_turn =
        current_turn_player ===
        player_id;

    if (is_my_turn) {

        turnText.textContent =
            "Your Turn";

    } else {

        turnText.textContent =
            `${get_player_name(current_turn_player)}'s Turn`;
    }

    set_play_enabled(
        is_my_turn
    );

    highlight_active_player();
}



function set_play_enabled(enabled) {

    handDiv.classList.toggle(
        "disabled",
        !enabled
    );
}



function highlight_active_player() {

    document
        .querySelectorAll(".opponent")
        .forEach(el => {

            const pid =
                Number(
                    el.dataset.playerId
                );

            el.classList.toggle(
                "active-turn",
                pid === current_turn_player
            );
        });

    handDiv.classList.toggle(
        "active-turn",
        current_turn_player === player_id
    );
}



//
// ======================================================
// PILE
// ======================================================
//

function render_pile(card) {

    const img =
        document.createElement("img");

    img.className =
        "card";

    img.src =
        `${CARD_IMG_BASE}/${card_to_filename(card)}`;

    img.alt =
        `${card.rank} of ${card.suit}`;

    img.draggable = false;

    pileDiv.appendChild(img);
}



function clear_pile() {

    pileDiv.innerHTML = "";
}



//
// ======================================================
// HAND HELPERS
// ======================================================
//

function remove_card_from_hand(card) {

    const idx =
        hand.findIndex(
            c =>
                c.rank === card.rank &&
                c.suit === card.suit
        );

    if (idx === -1) {

        console.warn(
            "card not found",
            card
        );

        return;
    }

    hand.splice(idx, 1);

    render_hand();
}



function update_player_count(
    player_id,
    delta
) {

    const seat =
        seats.find(
            s => s.id === player_id
        );

    if (!seat) {
        return;
    }

    seat.count =
        Math.max(
            0,
            seat.count + delta
        );
}



//
// ======================================================
// END SCREEN
// ======================================================
//

function show_end_game_screen(
    loserId
) {

    set_play_enabled(false);

    show_screen(endScreen);

    if (loserId === player_id) {

        endTitle.textContent =
            "You Lost";

        endMessage.textContent =
            "Better luck next time";

    } else {

        endTitle.textContent =
            "You Won";

        endMessage.textContent =
            `${get_player_name(loserId)} lost`;
    }
}



function highlight_winner(
    winnerId
) {

    document
        .querySelectorAll(".opponent")
        .forEach(el => {

            const pid =
                Number(
                    el.dataset.playerId
                );

            if (pid === winnerId) {

                el.classList.add("won");
            }
        });
}



//
// ======================================================
// TOAST
// ======================================================
//

function show_toast(
    message,
    duration = 1500
) {

    const toast =
        document.getElementById(
            "toast"
        );

    toast.textContent =
        message;

    toast.classList.remove(
        "hidden"
    );

    if (toastTimeout) {

        clearTimeout(
            toastTimeout
        );
    }

    toastTimeout =
        setTimeout(() => {

            toast.classList.add(
                "hidden"
            );

        }, duration);
}




//---------------------



function get_player_name(p_id) {

    const player =
        players.get(p_id);

    if (!player) {
        return `Player ${p_id}`;
    }

    return player.name;
}