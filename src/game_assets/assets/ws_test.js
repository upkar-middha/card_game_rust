// ===============================
// Client state
// ===============================

let player_id = null;
let is_ready = false;
let game_started = false;

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

        case "SeatOrder":
          server_seats = data.seats;
          seats = rotate_seats(server_seats, player_id);

          render_opponents();
          break;
        
        case "NextTurn":
          current_turn_player = data.player_id;

          update_turn_ui();
          break;

        case "CardPlayed": {
          const { card, p_id } = data;

          // 1. Update pile for everyone
          pile.push(card);
          render_pile(card);

          // 2. If THIS client played the card, remove from hand
          if (p_id === player_id) {
              remove_card_from_hand(card);
          }

          break;
        }


        case "Error":
            console.error("server error:", data.message);
            break;

        case "FoulGiven": {
          const { from, to, cards } = data;

          // Only the punished player updates their hand
          if (to === player_id) {
              hand = hand.concat(cards);
              render_hand();
              status.textContent = `You received ${cards.length} penalty card(s)`;
          } else {
              // Optional: just show info, no state change
              status.textContent = `Player ${to} received ${cards.length} penalty card(s)`;
          }

          break;
        }

        case "PlayerWon": {
            const winnerId = data.player_id;

            status.textContent = `Player ${winnerId} won the game`;

            // Optional: highlight winner
            highlight_winner(winnerId);

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


function render_hand() {
    const handDiv = document.getElementById("hand");
    handDiv.innerHTML = "";

    for (const card of hand) {
        const el = document.createElement("div");
        el.className = "card";

        el.textContent = `${card.rank} ${card.suit}`;

        el.onclick = () => {
            play_card(card);
        };

        handDiv.appendChild(el);
    }
}


function render_opponents() {
    const oppDiv = document.getElementById("opponents");
    oppDiv.innerHTML = "";

    for (let i = 1; i < seats.length; i++) {
        const pid = seats[i];

        const el = document.createElement("div");
        el.className = "opponent";
        el.dataset.playerId = pid;

        el.textContent = `Player ${pid}`;
        oppDiv.appendChild(el);
    }

    highlight_active_player();
}


function play_card(card) {
    send_action({
        CardPlayedByPlayer: {
            player_id: player_id,
            card: card
        }
    });
}

function rotate_seats(seats, player_id) {
    const idx = seats.indexOf(player_id);

    if (idx === -1) {
        console.warn("player_id not found in seats", player_id, seats);
        return seats;
    }

    return seats.slice(idx).concat(seats.slice(0, idx));
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

    // Show the top card only
    pileDiv.textContent = `${card.rank} ${card.suit}`;
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
