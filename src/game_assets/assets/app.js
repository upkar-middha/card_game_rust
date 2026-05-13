// ═══════════════════════════════════════════
//  WEBSOCKET
// ═══════════════════════════════════════════

const protocol = window.location.protocol === "https:" ? "wss" : "ws";
const ws = new WebSocket(`${protocol}://${window.location.host}/ws`);

// ═══════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════

let player_id     = null;
let player_name   = "";
let hand          = [];       // [{rank, suit}, …]
let seats         = [];       // [PlayerId, …] rotated so self is first
let names         = {};       // PlayerId → name string
let counts        = {};       // PlayerId → card count (from SeatOrder)
let current_turn  = null;
let pile          = [];
let game_started  = false;
let room_id_local = null;
let is_ready      = false;
let won_players   = new Set();

const CARD_IMG_BASE = "/assets/Playing Cards/Playing Cards/PNG-cards-1.3";

const RANK_MAP = {
    Ace:"ace", Two:"2", Three:"3", Four:"4", Five:"5", Six:"6",
    Seven:"7", Eight:"8", Nine:"9", Ten:"10",
    Jack:"jack", Queen:"queen", King:"king"
};

const SUIT_MAP = {
    Diamond:"diamonds", Spade:"spades", Club:"clubs", Heart:"hearts"
};

function card_src(card) {
    return `${CARD_IMG_BASE}/${RANK_MAP[card.rank]}_of_${SUIT_MAP[card.suit]}.png`;
}

// ═══════════════════════════════════════════
//  DOM REFS
// ═══════════════════════════════════════════

const screenLobby  = document.getElementById("screen-lobby");
const screenGame   = document.getElementById("screen-game");
const screenEnd    = document.getElementById("screen-end");

const stepName     = document.getElementById("step-name");
const stepRoom     = document.getElementById("step-room");
const greetingEl   = document.getElementById("greeting");
const statusEl     = document.getElementById("status");
const roomInfoEl   = document.getElementById("roomInfo");
const waitingPanel = document.getElementById("waiting-panel");
const waitingNames = document.getElementById("waiting-names");
const readyBtn     = document.getElementById("readyBtn");

const barRoomEl    = document.getElementById("bar-room");
const barTurnEl    = document.getElementById("bar-turn");
const opponentsEl  = document.getElementById("opponents");
const pileEl       = document.getElementById("pile");
const pileLabelEl  = document.getElementById("pile-label");
const handEl       = document.getElementById("hand");

// ═══════════════════════════════════════════
//  WS LIFECYCLE
// ═══════════════════════════════════════════

ws.onopen = () => {
    statusEl.textContent = "Connected — enter your name to continue";
};

ws.onclose = () => {
    statusEl.textContent = "Disconnected";
    show_toast("Connection lost");
};

ws.onerror = () => {
    statusEl.textContent = "Connection error";
};

ws.onmessage = (e) => {
    const raw = JSON.parse(e.data);
    handle_server_message(raw);
};

// ═══════════════════════════════════════════
//  MESSAGE ROUTING
// ═══════════════════════════════════════════

function handle_server_message(msg) {
    if (msg.Event) {
        const type = Object.keys(msg.Event)[0];
        handle_event(type, msg.Event[type]);
    } else if (msg.PrivateMsg) {
        const type = Object.keys(msg.PrivateMsg)[0];
        handle_private(type, msg.PrivateMsg[type]);
    }
}

// ═══════════════════════════════════════════
//  PRIVATE MESSAGES
// ═══════════════════════════════════════════

function handle_private(type, data) {
    switch (type) {

        case "Id":
            player_id = data.p_id;
            break;

        case "Hand":
            hand = data.cards;
            render_hand();
            break;

        case "InvalidCard":
            show_toast("⚠ Invalid card — you must follow suit");
            break;

        case "SnapShot":
            // Sent when a player joins — gives full current player list
            seats = data.p_ids.slice();
            for (let i = 0; i < data.p_ids.length; i++) {
                names[data.p_ids[i]] = data.names[i];
            }
            rotate_seats();
            render_waiting_panel();
            render_opponents();
            break;

        case "RoomCreated":
            room_id_local = data.room_id;
            roomInfoEl.textContent = `Room ID: ${data.room_id}`;
            roomInfoEl.classList.remove("hidden");
            waitingPanel.classList.remove("hidden");
            render_waiting_panel();
            show_toast(`Room ${data.room_id} created`);
            barRoomEl.textContent = `Room ${data.room_id}`;
            break;
    }
}

// ═══════════════════════════════════════════
//  PUBLIC EVENTS
// ═══════════════════════════════════════════

function handle_event(type, data) {
    switch (type) {

        case "PlayerAdded":
            names[data.p_id] = data.name;
            if (!seats.includes(data.p_id)) seats.push(data.p_id);
            render_waiting_panel();
            render_opponents();
            show_toast(`${data.name} joined`);
            break;

        case "PlayerLeft":
            seats = seats.filter(id => id !== data.p_id);
            delete names[data.p_id];
            render_waiting_panel();
            render_opponents();
            show_toast(`${names[data.p_id] || "A player"} left`);
            break;

        case "MarkReady":
            show_toast(`${names[data.p_id] || "Player"} is ready ✓`);
            break;

        case "SeatOrder":
            seats = data.seats.slice();
            for (let i = 0; i < data.seats.length; i++) {
                counts[data.seats[i]] = data.counts[i];
            }
            rotate_seats();
            render_opponents();
            break;

        case "StartGame":
            game_started = true;
            show_screen(screenGame);
            barRoomEl.textContent = room_id_local ? `Room ${room_id_local}` : "";
            won_players.clear();
            break;

        case "NextTurn":
            current_turn = data.player_id;
            update_turn_ui();
            break;

        case "CardPlayed":
            pile.push(data.card);
            render_pile();
            if (data.p_id !== player_id) {
                // Decrement opponent count display
                if (counts[data.p_id] !== undefined) counts[data.p_id]--;
                render_opponents();
            }
            break;

        case "DiscardPile":
            pile = [];
            render_pile();
            break;

        case "FoulGiven": {
            const from_name = names[data.from] || `#${data.from}`;
            const to_name   = names[data.to]   || `#${data.to}`;
            show_toast(`Foul! ${from_name} → ${to_name} gets ${data.cards.length} cards`);

            if (data.to === player_id) {
                hand = hand.concat(data.cards);
                render_hand();
            } else {
                if (counts[data.to] !== undefined) {
                    counts[data.to] += data.cards.length;
                    render_opponents();
                }
            }
            break;
        }

        case "PlayerWon":
            won_players.add(data.player_id);
            show_toast(`${names[data.player_id] || "Player"} finished! 🎉`);
            render_opponents();
            // Remove winner's cards from hand if it's us
            if (data.player_id === player_id) {
                hand = [];
                render_hand();
            }
            break;

        case "SpecialEvent": {
            // p_id lost all cards → draws random from `from`
            const receiver_name = names[data.p_id]   || `#${data.p_id}`;
            const giver_name    = names[data.from]    || `#${data.from}`;
            show_toast(`${receiver_name} draws a hidden card from ${giver_name}`);

            if (data.p_id === player_id) {
                hand.push(data.card);
                render_hand();
            }
            if (counts[data.from] !== undefined) counts[data.from]--;
            if (counts[data.p_id] !== undefined)  counts[data.p_id]++;
            render_opponents();
            break;
        }

        case "EndGame": {
            const loser_name = names[data.p_id] || `#${data.p_id}`;
            show_end(data.p_id, loser_name);
            break;
        }

        case "AbortGame":
            show_toast("Game aborted");
            reset_to_lobby();
            break;

        case "RoomFull":
            show_toast("Room is full");
            break;

        case "GameInProgress":
            show_toast("A game is already in progress");
            break;

        case "PlayerNotFound":
            show_toast("Player not found");
            break;

        case "InvalidPlayer":
            show_toast("Not your turn");
            break;

        case "Error":
            show_toast(`Error: ${data.message}`);
            break;
    }
}

// ═══════════════════════════════════════════
//  OUTGOING ACTIONS
// ═══════════════════════════════════════════

function send_name() {
    const input = document.getElementById("nameInput");
    const name = input.value.trim();
    if (!name) return;

    player_name = name;
    ws.send(JSON.stringify({ Name: { name } }));

    greetingEl.textContent = `Welcome, ${name}`;
    stepName.classList.remove("active");
    stepRoom.classList.add("active");
    input.disabled = true;
}

function create_room() {
    ws.send(JSON.stringify({ CreateRoom: {} }));
}

function join_room() {
    const val = Number(document.getElementById("roomInput").value);
    if (!val) { show_toast("Enter a valid Room ID"); return; }
    ws.send(JSON.stringify({ JoinRoom: { room_id: val } }));
    room_id_local = val;
    barRoomEl.textContent = `Room ${val}`;
    waitingPanel.classList.remove("hidden");
    render_waiting_panel();
}

function leave_room() {
    ws.send(JSON.stringify({ LeaveRoom: {} }));
    reset_to_lobby();
}

function send_ready() {
    if (is_ready) return;
    is_ready = true;
    readyBtn.textContent = "Waiting…";
    readyBtn.classList.add("is-ready");
    ws.send(JSON.stringify({ Action: { action: { Ready: {} } } }));
}

function play_card(card) {
    if (current_turn !== player_id) {
        show_toast("Not your turn");
        return;
    }
    ws.send(JSON.stringify({
        Action: { action: { CardPlayedByPlayer: { card } } }
    }));
}

// keyboard: Enter submits name
document.getElementById("nameInput").addEventListener("keydown", e => {
    if (e.key === "Enter") send_name();
});

document.getElementById("roomInput")?.addEventListener("keydown", e => {
    if (e.key === "Enter") join_room();
});

// ═══════════════════════════════════════════
//  RENDER HELPERS
// ═══════════════════════════════════════════

function render_hand() {
    handEl.innerHTML = "";

    const is_my_turn = current_turn === player_id;
    handEl.className = "hand " + (is_my_turn ? "your-turn" : "not-your-turn");

    hand.forEach((card, idx) => {
        const img = document.createElement("img");
        img.className = "card-img card-deal-anim";
        img.style.animationDelay = `${idx * 30}ms`;
        img.src = card_src(card);
        img.alt = `${card.rank} of ${card.suit}`;
        img.draggable = false;

        img.onclick = () => play_card(card);

        handEl.appendChild(img);
    });
}

function render_opponents() {
    opponentsEl.innerHTML = "";

    for (const id of seats) {
        if (id === player_id) continue;

        const seat = document.createElement("div");
        seat.className = "opponent-seat";
        if (id === current_turn) seat.classList.add("active-turn");
        if (won_players.has(id))  seat.classList.add("won");

        const initial = (names[id] || "?")[0].toUpperCase();
        const cnt     = counts[id] !== undefined ? counts[id] : "?";

        seat.innerHTML = `
            <div class="opponent-avatar">${initial}</div>
            <div class="opponent-name">${names[id] || id}</div>
            <div class="opponent-count">${won_players.has(id) ? "✓ Done" : cnt + " cards"}</div>
        `;

        opponentsEl.appendChild(seat);
    }
}

function render_pile() {
    pileEl.innerHTML = "";

    if (pile.length === 0) {
        pileLabelEl.textContent = "No cards played";
        return;
    }

    pileLabelEl.textContent = `${pile.length} card${pile.length > 1 ? "s" : ""} in play`;

    // Show last 5 cards max to avoid overflow
    const visible = pile.slice(-5);
    visible.forEach(card => {
        const img = document.createElement("img");
        img.className = "card-img";
        img.src = card_src(card);
        img.alt = `${card.rank} of ${card.suit}`;
        img.draggable = false;
        pileEl.appendChild(img);
    });
}

function render_waiting_panel() {
    const player_list = seats
        .map(id => names[id] || `#${id}`)
        .join(", ");
    waitingNames.textContent = player_list
        ? `In room: ${player_list}`
        : "Waiting for players…";
}

function update_turn_ui() {
    if (current_turn === player_id) {
        barTurnEl.textContent = "Your Turn";
        handEl.className = "hand your-turn";
    } else {
        const name = names[current_turn] || `#${current_turn}`;
        barTurnEl.textContent = `${name}'s Turn`;
        handEl.className = "hand not-your-turn";
    }
    render_opponents();
}

// ═══════════════════════════════════════════
//  SCREEN SWITCHING
// ═══════════════════════════════════════════

function show_screen(target) {
    [screenLobby, screenGame, screenEnd].forEach(s => s.classList.remove("active"));
    target.classList.add("active");
}

function reset_to_lobby() {
    game_started = false;
    is_ready = false;
    hand = [];
    pile = [];
    seats = [];
    names = {};
    counts = {};
    won_players.clear();
    current_turn = null;

    readyBtn.textContent = "Ready Up";
    readyBtn.classList.remove("is-ready");

    handEl.innerHTML = "";
    pileEl.innerHTML = "";
    opponentsEl.innerHTML = "";

    show_screen(screenLobby);
}

function show_end(loser_id, loser_name) {
    show_screen(screenEnd);

    const suitEl   = document.getElementById("end-suit");
    const titleEl  = document.getElementById("endTitle");
    const msgEl    = document.getElementById("endMessage");

    if (loser_id === player_id) {
        suitEl.textContent  = "♣";
        titleEl.textContent = "You Lost";
        msgEl.textContent   = "Better luck next time.";
    } else {
        suitEl.textContent  = "♠";
        titleEl.textContent = "Game Over";
        msgEl.textContent   = `${loser_name} is the loser!`;
    }
}

// ═══════════════════════════════════════════
//  UTILS
// ═══════════════════════════════════════════

function rotate_seats() {
    if (player_id === null) return;
    const idx = seats.indexOf(player_id);
    if (idx === -1) return;
    seats = seats.slice(idx).concat(seats.slice(0, idx));
}

let toast_timer = null;

function show_toast(message) {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.remove("hidden");

    if (toast_timer) clearTimeout(toast_timer);
    toast_timer = setTimeout(() => {
        toast.classList.add("hidden");
    }, 2200);
}
