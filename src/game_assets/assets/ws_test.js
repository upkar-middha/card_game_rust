// ===============================
// Client state
// ===============================
// if a player playeed fast just after last player in cycle played , discard pile does not work properly
let player_id = null;
let is_ready = false;
let game_started = false;
let toastTimeout = null;
let discardTimeout = null;


// ===============================
// UI
// ===============================

const lobby = document.getElementById("lobby");
const game = document.getElementById("game");
const playBtn = document.getElementById("playBtn");
const status = document.getElementById("status");
let current_turn_player = null;
let game_over = false;

let hand = [];
let server_seats = [];   // raw order from server
let seats = [];
let pile = [];   // cards on table (top = last)

const SUIT_SYMBOL = {
    Heart: "♥",
    Diamond: "♦",
    Spade: "♠",
    Club: "♣"
};

const SUIT_COLOR = {
    Heart: "red",
    Diamond: "red",
    Spade: "black",
    Club: "black"
};



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

const CARD_IMG_BASE = "/assets/Playing Cards/Playing Cards/PNG-cards-1.3";

function card_to_filename(card) {
    const rank = RANK_TO_FILENAME[card.rank];
    const suit = SUIT_TO_FILENAME[card.suit];

    if (!rank || !suit) {
        console.error("Unknown card format", card);
        return "";
    }

    return `${rank}_of_${suit}.png`;
}



// ===============================
// WebSocket
// ===============================

const ws = new WebSocket(`ws://${window.location.host}/ws`);

ws.onopen = () => {
    console.log("connected");
    status.textContent = "Connected. Waiting for Id...";
};

ws.onmessage = (event) => {
    const raw = JSON.parse(event.data);
    console.log("← raw", raw);

    const { type, data } = unwrap_enum(raw);
    handle_server_event(type, data);
};

ws.onerror = (err) => {
    console.error("ws error", err);
};

ws.onclose = () => {
    console.log("disconnected");
};

// ===============================
// Enum unwrap helper (for Events / PrivateMsg)
// ===============================

function unwrap_enum(msg) {
    if (typeof msg === "string") {
        return { type: msg, data: null };
    }

    const key = Object.keys(msg)[0];
    return { type: key, data: msg[key] };
}

// ===============================
// Event handling (server → client)
// ===============================

function handle_server_event(type, data) {
    switch (type) {

        // ---------- PRIVATE ----------
        case "Id":
            if (player_id !== null) return;

            player_id = data.p_id;
            console.log("assigned player_id:", player_id);
            status.textContent = `Your ID: ${player_id}`;
            break;

        case "Hand":
             hand = data.cards;
            render_hand();
            break;

        // ---------- PUBLIC ----------
        case "MarkReady":
            console.log("player ready:", data.p_id);

            if (data.p_id === player_id) {
                status.textContent = "You are ready. Waiting for others...";
            }
            break;

        case "StartGame":
            if (game_started) return;

            game_started = true;
            start_game_ui();
            break;

        case "SeatOrder": {
            const zipped = data.seats.map((id, i) => ({
                id,
                count: data.counts[i]
            }));

            const idx = zipped.findIndex(p => p.id === player_id);
            if (idx === -1) return;

            const rotated = zipped.slice(idx).concat(zipped.slice(0, idx));

            seats = rotated; // now seats is [{id, count}, ...]
            render_opponents();
            break;
        }

        
        case "NextTurn":
          current_turn_player = data.player_id;

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




        case "Error":
            console.error("server error:", data.message);
            break;

        case "FoulGiven": {
            const { from, to, cards } = data;

            update_player_count(to, cards.length);

            if (to === player_id) {
                hand = hand.concat(cards);
                render_hand();
            }

            render_opponents();

            show_toast(`Player ${to} received a foul (+${cards.length})`);
            break;
        }




        case "PlayerWon": {
            const winnerId = data.player_id;

            status.textContent = `Player ${winnerId} won the game`;

            // Optional: highlight winner
            highlight_winner(winnerId);

            break;
        }

        case "DiscardPile": {
            if (discardTimeout) {
                clearTimeout(discardTimeout);
            }

            discardTimeout = setTimeout(() => {
                pile = [];
                clear_pile();
                discardTimeout = null;
            }, 1000);

            break;
        }


        case "EndGame": {
          if (game_over) return;
          game_over = true;

          const loserId = data.p_id;

          show_end_game_screen(loserId);
          break;
      }


        default:
            console.warn("unhandled event:", type, data);
    }
}

// ===============================
// Play / Ready (client → server)
// ===============================

playBtn.onclick = () => {
    if (player_id === null) {
        console.warn("Id not assigned yet");
        return;
    }

    if (is_ready) return;

    // ✅ MATCHES Action::Ready { player_id }
    send_action({
        Ready: {
            player_id: player_id
        }
    });

    is_ready = true;
    playBtn.disabled = true;
    status.textContent = "Sent Ready...";
};

// ===============================
// Send helper
// ===============================

function send_action(obj) {
    if (ws.readyState !== WebSocket.OPEN) {
        console.warn("socket not open");
        return;
    }

    ws.send(JSON.stringify(obj));
    console.log("→", obj);
}

// ===============================
// UI
// ===============================

function start_game_ui() {
    console.log("GAME STARTED");

    lobby.classList.remove("active");
    game.classList.add("active");
}


// function render_hand() {
//     const handDiv = document.getElementById("hand");
//     handDiv.innerHTML = "";

//     for (const card of hand) {
//         const el = document.createElement("div");
//         el.className = "card";

//         el.textContent = `${card.rank} ${card.suit}`;

//         el.onclick = () => {
//             play_card(card);
//         };

//         handDiv.appendChild(el);
//     }
// }


// function render_opponents() {
//     const oppDiv = document.getElementById("opponents");
//     oppDiv.innerHTML = "";

//     // index 0 is YOU, so start from 1
//     for (let i = 1; i < seats.length; i++) {
//         const pid = seats[i];
//         const count = card_counts[i];

//         const el = document.createElement("div");
//         el.className = "opponent";
//         el.dataset.playerId = pid;

//         const name = document.createElement("div");
//         name.className = "opponent-name";
//         name.textContent = `Player ${pid}`;

//         const cards = document.createElement("div");
//         cards.className = "opponent-cards";

//         for (let c = 0; c < count; c++) {
//             const back = document.createElement("div");
//             back.className = "opponent-card";
//             cards.appendChild(back);
//         }

//         el.appendChild(name);
//         el.appendChild(cards);
//         oppDiv.appendChild(el);
//     }

//     highlight_active_player();
// }
function render_opponents() {
    const oppDiv = document.getElementById("opponents");
    oppDiv.innerHTML = "";

    // seats = [{ id, count }, ...]  (rotated, self at index 0)
    for (let i = 1; i < seats.length; i++) {
        const { id, count } = seats[i];

        const el = document.createElement("div");
        el.className = "opponent";
        el.dataset.playerId = id;

        const name = document.createElement("div");
        name.className = "opponent-name";
        name.textContent = `Player ${id}`;

        const cards = document.createElement("div");
        cards.className = "opponent-cards";

        for (let c = 0; c < count; c++) {
            const back = document.createElement("div");
            back.className = "opponent-card";
            cards.appendChild(back);
        }

        el.appendChild(name);
        el.appendChild(cards);
        oppDiv.appendChild(el);
    }

    highlight_active_player();
}





// function play_card(card) {
//     send_action({
//         CardPlayedByPlayer: {
//             player_id: player_id,
//             card: card
//         }
//     });
// }

function rotate_seats(data, player_id) {
    const { seats, counts } = data;

    const idx = seats.indexOf(player_id);
    if (idx === -1) {
        console.warn("player_id not found in seats", player_id, seats);
        return data;
    }

    return {
        seats: seats.slice(idx).concat(seats.slice(0, idx)),
        counts: counts.slice(idx).concat(counts.slice(0, idx)),
    };
}



function update_turn_ui() {
    // Enable play only if it's YOUR turn
    const is_my_turn = current_turn_player === player_id;

    if (is_my_turn) {
        status.textContent = "Your turn";
    } else {
        status.textContent = `Player ${current_turn_player}'s turn`;
    }

    // Disable card clicks / play button
    set_play_enabled(is_my_turn);

    // Highlight active player for everyone
    highlight_active_player();
}

function set_play_enabled(enabled) {
    const handDiv = document.getElementById("hand");

    handDiv.classList.toggle("disabled", !enabled);
}


function highlight_active_player() {
    // Highlight opponents
    document.querySelectorAll(".opponent").forEach(el => {
        const pid = Number(el.dataset.playerId);

        el.classList.toggle(
            "active-turn",
            pid === current_turn_player
        );
    });

    // Highlight self (optional)
    const handDiv = document.getElementById("hand");
    handDiv.classList.toggle(
        "active-turn",
        current_turn_player === player_id
    );
}

function play_card(card) {
    if (current_turn_player !== player_id) {
        console.warn("Not your turn");
        return;
    }

    send_action({
        CardPlayedByPlayer: {
            player_id: player_id,
            card: card
        }
    });
}

function remove_card_from_hand(card) {
    const idx = hand.findIndex(
        c => c.rank === card.rank && c.suit === card.suit
    );

    if (idx === -1) {
        console.warn("Played card not found in hand", card);
        return;
    }

    hand.splice(idx, 1);
    render_hand();
}

function render_pile(card) {
    const pileDiv = document.getElementById("pile");

    const img = document.createElement("img");
    img.className = "card";
    img.src = `${CARD_IMG_BASE}/${card_to_filename(card)}`;
    img.alt = `${card.rank} of ${card.suit}`;
    img.draggable = false;

    pileDiv.appendChild(img);
}



function show_end_game_screen(loserId) {
    // Disable interaction
    set_play_enabled(false);

    // Hide game screen
    game.classList.remove("active");

    // Show end screen
    const endScreen = document.getElementById("endGame");
    const endTitle = document.getElementById("endTitle");
    const endMessage = document.getElementById("endMessage");

    endScreen.classList.add("active");

    if (loserId === player_id) {
        endTitle.textContent = "You Lost 💀";
        endMessage.textContent = "Better luck next time!";
    } else {
        endTitle.textContent = "Game Over";
        endMessage.textContent = `Player ${loserId} lost the game`;
    }
}


function render_hand() {
    // img.onclick = () => {
    //     console.log("CARD CLICKED", card, {
    //         current_turn_player,
    //         player_id
    //     });
    //     play_card(card);
    // };

    const handDiv = document.getElementById("hand");
    handDiv.innerHTML = "";

    for (const card of hand) {
        const img = document.createElement("img");
        img.className = "card";

        img.src = `${CARD_IMG_BASE}/${card_to_filename(card)}`;
        img.alt = `${card.rank} of ${card.suit}`;
        img.draggable = false;

        img.onclick = () => {
            play_card(card);
        };

        handDiv.appendChild(img);
    }
}

function clear_pile() {
    const pileDiv = document.getElementById("pile");
    pileDiv.innerHTML = "";
}



function show_toast(message, duration = 1500) {
    const toast = document.getElementById("toast");

    toast.textContent = message;
    toast.classList.remove("hidden");

    // Clear previous timeout if any
    if (toastTimeout) {
        clearTimeout(toastTimeout);
    }

    toastTimeout = setTimeout(() => {
        toast.classList.add("hidden");
    }, duration);
}
function update_player_count(player_id, delta) {
    const seat = seats.find(s => s.id === player_id);
    if (!seat) return;

    seat.count = Math.max(0, seat.count + delta);
}


