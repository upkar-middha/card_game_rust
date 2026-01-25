use std::sync::Arc;
use tokio::sync::{RwLock, broadcast, mpsc};
 // {todo!("event is empty then send cant be added or early check if players are full , dont add")}
 // if person exit and game is in playing phase , broadcast abort game , reset game 
use axum::{
    extract::{
        State, ws::{Message, WebSocket, WebSocketUpgrade}
    },
    response::IntoResponse,
};

use futures_util::{StreamExt, SinkExt};

use crate::{game::{actions::Action, event::{Event, PrivateMsg}}, network::Messages::OutgoingMsg};
use crate::game::logic::Game;
use crate::game::logic::GamePhase;
#[derive(Clone)]
pub struct AppState {
    pub game: Arc<RwLock<Game>>,
    pub tx: broadcast::Sender<Event>,
}


pub async fn ws_handler(ws : WebSocketUpgrade , State(state) : State<AppState>) -> impl IntoResponse{ //why impl here ??
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: AppState) {

    // join
    let (player_id, join_event) = {
        let mut game = state.game.write().await;
        match game.add_player() {
            Some(Event::PlayerAdded { p_id }) => (p_id, Some(Event::PlayerAdded { p_id })),
            _ => return,
        }
    };

    if let Some(ev) = join_event {
        let _ = state.tx.send(ev);
    }

    let mut rx = state.tx.subscribe();
    let (sender, mut receiver) = socket.split();

    let (out_tx, mut out_rx) = mpsc::unbounded_channel::<OutgoingMsg>();

    // ----- WRITING TASK -----
    let writer_task = tokio::spawn(async move {
        let mut sender = sender;

        while let Some(msg) = out_rx.recv().await {
            let json = match msg {
                OutgoingMsg::Public(ev) => serde_json::to_string(&ev).unwrap(),
                OutgoingMsg::Private(pm) => serde_json::to_string(&pm).unwrap(),
            };

            if sender.send(Message::Text(json)).await.is_err() {
                break;
            }
        }
    });

    // ---- BROADCAST LISTENER ------
    let game_for_broadcast = state.game.clone();
    let my_id = player_id;
    let public_tx = out_tx.clone();

    let broadcast_task = tokio::spawn(async move {
        let mut hand_sent = false;

        while let Ok(ev) = rx.recv().await {
            // forward public event
            let _ = public_tx.send(OutgoingMsg::Public(ev.clone()));

            // 🔒 send hand ONCE when StartGame is observed
            if matches!(ev, Event::StartGame) && !hand_sent {
                let hand = {
                    let game = game_for_broadcast.read().await;
                    game.get_hand(my_id)
                };

                if let Some(cards) = hand {
                    let _ = public_tx.send(
                        OutgoingMsg::Private(
                            PrivateMsg::Hand { cards }
                        )
                    );
                    hand_sent = true; // ✅ exactly once
                }
            }
        }
    });

    // ---- RECEIVE TASK ----
    let recv_task = {
        let game = state.game.clone();
        let tx = state.tx.clone();

        tokio::spawn(async move {
            while let Some(Ok(Message::Text(text))) = receiver.next().await {
                let Ok(action) = serde_json::from_str::<Action>(&text) else {
                    continue;
                };

                let mut started_game = false;

                let events = {
                    let mut game = game.write().await;

                    let events = game.apply_action(action);

                    // deal cards ONCE, globally
                    if game.get_phase() == GamePhase::Playing && !game.cards_dealt() {
                        game.start_game();
                        started_game = true;
                    }

                    events
                };

                // broadcast action-generated events
                for ev in events {
                    let _ = tx.send(ev);
                }

                // broadcast turn info ONCE
                if started_game {
                    let turn = {
                        let game = game.read().await;
                        game.get_turn()
                    };
                    let _ = tx.send(Event::NextTurn { player_id: turn });
                }
            }
        })
    };

    // wait....
    tokio::select! {
        _ = writer_task => {},
        _ = broadcast_task => {},
        _ = recv_task => {},
    }

    // ---- LEAVE ----
    let outcome = {
        let mut g = state.game.write().await;
        g.remove_player(player_id)
    };

    if let Some(ev) = outcome {
        let _ = state.tx.send(ev);
    }
}


   