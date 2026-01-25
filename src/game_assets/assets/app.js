/**
 * Card Game Client
 * Vanilla JS implementation following server-authoritative architecture
 */

// ==========================================
// Configuration
// ==========================================
const CONFIG = {
    WS_URL: `ws://${window.location.hostname}:8080`,
    ANIMATION_DURATION: 300,
    QUEUE_DELAY: 50,
};

// ==========================================
// Game State
// ==========================================
const gameState = {
    myPlayerId: null,
    players: {}, // { playerId: { name, hand, seatIndex } }
    mySeatIndex: null,
    currentTurn: null,
    round: 0,
    displayPile: [], // Cards currently visible on table before discard
    gameActive: false,
    eventQueue: [], // Queue for animations
    isProcessingQueue: false,
};

// ==========================================
// WebSocket Management
// ==========================================
let ws = null;

function connectWebSocket() {
    return new Promise((resolve, reject) => {
        try {
            ws = new WebSocket(CONFIG.WS_URL);

            ws.onopen = () => {
                console.log('WebSocket connected');
                updateStatus('Connected to server');
                resolve();
            };

            ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    handleServerMessage(message);
                } catch (error) {
                    console.error('Failed to parse message:', error);
                }
            };

            ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                updateStatus('Connection error');
                reject(error);
            };

            ws.onclose = () => {
                console.log('WebSocket disconnected');
                updateStatus('Disconnected from server');
            };
        } catch (error) {
            console.error('Failed to create WebSocket:', error);
            updateStatus('Failed to connect');
            reject(error);
        }
    });
}

// ==========================================
// Server Message Handlers
// ==========================================
function handleServerMessage(message) {
    console.log('Server message:', message);
    const { type, payload } = message;

    switch (type) {
        case 'ASSIGN_PLAYER_ID':
            handleAssignPlayerId(payload);
            break;
        case 'GAME_STARTED':
            handleGameStarted(payload);
            break;
        case 'CARDS_DISTRIBUTED':
            handleCardsDistributed(payload);
            break;
        case 'TURN_CHANGED':
            handleTurnChanged(payload);
            break;
        case 'CARD_PLAYED':
            handleCardPlayed(payload);
            break;
        case 'FOUL_GIVEN':
            handleFoulGiven(payload);
            break;
        case 'PILE_DISCARDED':
            handlePileDiscarded(payload);
            break;
        case 'GAME_ENDED':
            handleGameEnded(payload);
            break;
        case 'GAME_ABORTED':
            handleGameAborted(payload);
            break;
        default:
            console.warn('Unknown message type:', type);
    }
}

function handleAssignPlayerId(payload) {
    const { player_id } = payload;
    gameState.myPlayerId = player_id;
    console.log('Assigned player ID:', player_id);
    updateStatus('Ready to start');
}

function handleGameStarted(payload) {
    const { players, seat_assignments } = payload;

    // Initialize players state
    gameState.players = {};
    players.forEach((player) => {
        gameState.players[player.player_id] = {
            name: player.name || `Player ${player.player_id}`,
            hand: [],
            seatIndex: seat_assignments[player.player_id],
        };
    });

    // Find our seat
    gameState.mySeatIndex = seat_assignments[gameState.myPlayerId];
    gameState.gameActive = true;
    gameState.round = 0;
    gameState.displayPile = [];
    gameState.currentTurn = null;
    gameState.eventQueue = [];
    gameState.isProcessingQueue = false;

    console.log('Game started. My seat:', gameState.mySeatIndex);
    updateStatus('Game starting...');
}

function handleCardsDistributed(payload) {
    const { player_cards } = payload;

    // Update each player's hand
    player_cards.forEach(({ player_id, cards }) => {
        if (gameState.players[player_id]) {
            if (player_id === gameState.myPlayerId) {
                // Store full hand only for myself
                gameState.players[player_id].hand = cards;
            } else {
                // Store only card count for others (security)
                gameState.players[player_id].cardCount = cards.length;
            }
        }
    });

    // Reset display pile for new game
    gameState.displayPile = [];

    // Show game screen
    showGameScreen();
    renderGame();
}

function handleTurnChanged(payload) {
    const { current_player_id } = payload;
    gameState.currentTurn = current_player_id;
    const playerName = gameState.players[current_player_id]?.name || 'Unknown';
    updateStatus(`${playerName}'s turn`);
    renderGame();
}

function handleCardPlayed(payload) {
    const { player_id, card_index } = payload;
    const player = gameState.players[player_id];

    if (!player) {
        console.error('Unknown player:', player_id);
        return;
    }

    // Queue animation
    queueEvent(() => {
        // Remove card from player's hand
        if (player_id === gameState.myPlayerId) {
            // Remove from my hand array
            const handIndex = player.hand.indexOf(card_index);
            if (handIndex !== -1) {
                player.hand.splice(handIndex, 1);
            }
        } else {
            // Decrement opponent's card count
            if (player.cardCount > 0) {
                player.cardCount--;
            }
        }

        // Add card to display pile (visible on table)
        gameState.displayPile.push({ cardIndex: card_index, playerId: player_id });

        // Play animation
        return animateCardPlay(player_id, card_index);
    });

    renderGame();
}

function handleFoulGiven(payload) {
    const { player_id, foul_cards } = payload;
    const player = gameState.players[player_id];

    if (!player) return;

    // Queue animation
    queueEvent(() => {
        // Remove foul cards from player's hand
        if (player_id === gameState.myPlayerId) {
            // Remove from my hand array
            foul_cards.forEach((cardIndex) => {
                const idx = player.hand.indexOf(cardIndex);
                if (idx !== -1) {
                    player.hand.splice(idx, 1);
                }
            });
        } else {
            // Decrement opponent's card count
            player.cardCount = Math.max(0, player.cardCount - foul_cards.length);
        }

        // Add foul cards to display pile (visible on table)
        foul_cards.forEach((cardIndex) => {
            gameState.displayPile.push({ cardIndex, playerId: player_id });
        });

        // Play animation
        return animateCardPlay(player_id, foul_cards[0]);
    });

    renderGame();
}

function handlePileDiscarded(payload) {
    queueEvent(() => {
        return animatePileDiscard().then(() => {
            // Clear display pile after animation
            gameState.displayPile = [];
            renderPile();
        });
    });
}

function handleGameEnded(payload) {
    const { winner_id } = payload;
    const winnerName = gameState.players[winner_id]?.name || 'Unknown';
    gameState.gameActive = false;

    queueEvent(() => {
        updateStatus(`${winnerName} wins!`);
        return new Promise((resolve) => {
            setTimeout(() => {
                showLobbyScreen();
                resolve();
            }, 2000);
        });
    });
}

function handleGameAborted(payload) {
    gameState.gameActive = false;
    updateStatus('Game aborted');
    showLobbyScreen();
}

// ==========================================
// Event Queue System
// ==========================================
function queueEvent(eventFn) {
    gameState.eventQueue.push(eventFn);
    processEventQueue();
}

function processEventQueue() {
    if (gameState.isProcessingQueue || gameState.eventQueue.length === 0) {
        return;
    }

    gameState.isProcessingQueue = true;

    (async function process() {
        while (gameState.eventQueue.length > 0) {
            const eventFn = gameState.eventQueue.shift();
            try {
                await eventFn();
            } catch (error) {
                console.error('Error processing event:', error);
            }
            // Delay between events for visibility
            await new Promise((resolve) => setTimeout(resolve, CONFIG.QUEUE_DELAY));
        }
        gameState.isProcessingQueue = false;
    })();
}

// ==========================================
// Animations
// ==========================================
function animateCardPlay(playerId, cardIndex) {
    return new Promise((resolve) => {
        const player = gameState.players[playerId];
        if (!player) {
            resolve();
            return;
        }

        // Find element to animate from
        let fromElement;
        if (playerId === gameState.myPlayerId) {
            const cards = document.querySelectorAll('.card');
            const hand = player.hand;
            // Find any visible card (they'll all animate from same general area)
            fromElement = cards[0];
        } else {
            // Animate from opponent's card
            const opponentEl = document.querySelector(
                `[data-player-id="${playerId}"]`
            );
            if (opponentEl) {
                fromElement = opponentEl.querySelector('.opponent-card');
            }
        }

        if (!fromElement) {
            resolve();
            return;
        }

        // Create animated card element
        const animCard = document.createElement('div');
        animCard.className = 'card--animating';

        const fromRect = fromElement.getBoundingClientRect();
        const pileRect = document.querySelector('.pile').getBoundingClientRect();

        // Position animated card at source
        animCard.style.position = 'fixed';
        animCard.style.left = fromRect.left + 'px';
        animCard.style.top = fromRect.top + 'px';
        animCard.style.width = fromRect.width + 'px';
        animCard.style.height = fromRect.height + 'px';
        animCard.style.background = 'linear-gradient(135deg, #e74c3c, #c0392b)';
        animCard.style.border = '2px solid #a93226';
        animCard.style.borderRadius = '4px';
        animCard.style.zIndex = '1000';
        animCard.style.pointerEvents = 'none';

        // Calculate translation to pile
        const tx = pileRect.left - fromRect.left + pileRect.width / 2 - fromRect.width / 2;
        const ty = pileRect.top - fromRect.top + pileRect.height / 2 - fromRect.height / 2;

        animCard.style.setProperty('--tx', tx + 'px');
        animCard.style.setProperty('--ty', ty + 'px');

        document.body.appendChild(animCard);

        // Remove after animation
        setTimeout(() => {
            animCard.remove();
            resolve();
        }, CONFIG.ANIMATION_DURATION);
    });
}

function animatePileDiscard() {
    return new Promise((resolve) => {
        const pileCards = document.querySelectorAll('.pile-card');
        if (pileCards.length === 0) {
            resolve();
            return;
        }

        // Animate all cards
        pileCards.forEach((card, index) => {
            card.classList.add('pile-card--discard');
            // Stagger the animation slightly
            card.style.animationDelay = (index * 30) + 'ms';
        });

        setTimeout(() => {
            pileCards.forEach((card) => {
                card.classList.remove('pile-card--discard');
                card.style.animationDelay = '0ms';
            });
            resolve();
        }, 500);
    });
}

// ==========================================
// Rendering
// ==========================================
function renderGame() {
    renderTurnInfo();
    renderOpponents();
    renderPile();
    renderHand();
}

function renderOpponents() {
    const opponentsArea = document.getElementById('opponentsArea');
    opponentsArea.innerHTML = '';

    // Get players in seat order relative to us
    const playerIds = Object.keys(gameState.players);
    const sortedPlayers = playerIds.sort(
        (a, b) =>
            gameState.players[a].seatIndex - gameState.players[b].seatIndex
    );

    // Render opponents (everyone except us)
    sortedPlayers.forEach((playerId) => {
        if (playerId === gameState.myPlayerId) return;

        const player = gameState.players[playerId];
        const isActive = playerId === gameState.currentTurn;

        const opponentEl = document.createElement('div');
        opponentEl.className = 'opponent';
        opponentEl.setAttribute('data-player-id', playerId);

        const nameEl = document.createElement('div');
        nameEl.className = 'opponent-name';
        nameEl.textContent = player.name + (isActive ? ' (Playing)' : '');

        const cardsEl = document.createElement('div');
        cardsEl.className = 'opponent-cards';
        const cardCount = player.cardCount || 0;
        for (let i = 0; i < cardCount; i++) {
            const card = document.createElement('div');
            card.className = 'opponent-card';
            cardsEl.appendChild(card);
        }

        opponentEl.appendChild(nameEl);
        opponentEl.appendChild(cardsEl);
        opponentsArea.appendChild(opponentEl);
    });
}

function renderPile() {
    const pile = document.getElementById('pile');
    pile.innerHTML = '';

    if (gameState.displayPile.length === 0) {
        const emptyText = document.createElement('div');
        emptyText.style.color = 'rgba(255, 255, 255, 0.5)';
        emptyText.textContent = 'Pile: Empty';
        pile.appendChild(emptyText);
    } else {
        // Render all cards in display pile with staggered overlay
        gameState.displayPile.forEach((cardData, index) => {
            const card = document.createElement('div');
            card.className = 'pile-card';
            card.textContent = formatCard(cardData.cardIndex);
            // Stagger cards with slight offset
            card.style.transform = `translate(-50%, -50%) translateX(${index * 15}px) translateY(${index * 10}px) rotateZ(${index * 5}deg)`;
            card.style.zIndex = index;
            pile.appendChild(card);
        });
    }

    document.getElementById('pileCount').textContent = gameState.displayPile.length;
}

function renderHand() {
    const hand = document.getElementById('hand');
    hand.innerHTML = '';

    const myPlayer = gameState.players[gameState.myPlayerId];
    if (!myPlayer) return;

    const isMyTurn = gameState.currentTurn === gameState.myPlayerId;

    myPlayer.hand.forEach((cardIndex) => {
        const card = document.createElement('div');
        card.className = 'card';
        if (!isMyTurn) {
            card.classList.add('card--disabled');
        }
        card.textContent = formatCard(cardIndex);
        card.addEventListener('click', () => {
            if (isMyTurn) {
                playCard(cardIndex);
            }
        });
        hand.appendChild(card);
    });
}

function formatCard(cardIndex) {
    // Format based on your game's card indexing
    // Example: 0-12 = Ace-King of Spades, 13-25 = Hearts, etc.
    const suits = ['♠', '♥', '♦', '♣'];
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

    const suitIndex = Math.floor(cardIndex / 13);
    const rankIndex = cardIndex % 13;

    return ranks[rankIndex] + suits[suitIndex];
}

// ==========================================
// User Actions
// ==========================================
function playCard(cardIndex) {
    if (!gameState.gameActive || gameState.currentTurn !== gameState.myPlayerId) {
        return;
    }

    // Send to server, don't update UI immediately
    sendMessage({
        type: 'PLAY_CARD',
        payload: { card_index: cardIndex },
    });
}

function startGame() {
    if (!gameState.myPlayerId) {
        updateStatus('Not connected yet');
        return;
    }

    sendMessage({
        type: 'START_GAME',
        payload: {},
    });
}

function sendMessage(message) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.error('WebSocket not open');
        return;
    }

    ws.send(JSON.stringify(message));
}

// ==========================================
// UI Management
// ==========================================
function showLobbyScreen() {
    document.getElementById('lobby').classList.remove('hidden');
    document.getElementById('game').classList.add('hidden');
    // Clear all game state
    gameState.players = {};
    gameState.currentTurn = null;
    gameState.mySeatIndex = null;
    gameState.displayPile = [];
    gameState.gameActive = false;
    gameState.eventQueue = [];
    gameState.isProcessingQueue = false;
}

function showGameScreen() {
    document.getElementById('lobby').classList.add('hidden');
    document.getElementById('game').classList.remove('hidden');
}

function updateStatus(message) {
    const statusEl = document.getElementById('status');
    if (statusEl) {
        statusEl.textContent = message;
    }
}

function renderTurnInfo() {
    const turnEl = document.getElementById('turnPlayer');
    if (gameState.currentTurn && gameState.players[gameState.currentTurn]) {
        const playerName = gameState.players[gameState.currentTurn].name;
        const isMyTurn = gameState.currentTurn === gameState.myPlayerId;
        turnEl.textContent = playerName + "'s Turn" + (isMyTurn ? ' (YOU)' : '');
        turnEl.style.color = isMyTurn ? '#f39c12' : '#3498db';
    }
}

function updateTurnInfo() {
    const turnEl = document.getElementById('turnPlayer');
    if (gameState.currentTurn && gameState.players[gameState.currentTurn]) {
        turnEl.textContent =
            gameState.players[gameState.currentTurn].name + "'s Turn";
    }
}

// ==========================================
// Initialization
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    // Set up event listeners
    document.getElementById('startBtn').addEventListener('click', startGame);

    // Connect to server
    try {
        await connectWebSocket();
    } catch (error) {
        console.error('Failed to connect to server:', error);
        updateStatus('Failed to connect to server. Check if it is running.');
    }

    showLobbyScreen();
});

// Handle page unload
window.addEventListener('beforeunload', () => {
    if (ws) {
        ws.close();
    }
});
