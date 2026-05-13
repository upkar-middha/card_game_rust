use tokio::{sync::mpsc};
 // {todo!("event is empty then send cant be added or early check if players are full , dont add")}
 // if person exit and game is in playing phase , broadcast abort game , reset game 
use axum::{
    extract::{
        State, ws::{Message, WebSocket, WebSocketUpgrade}
    },
    response::IntoResponse,
};

use futures_util::{StreamExt, SinkExt};

use crate::{game::{actions::{ClientRequest, InterfaceRequest}, event::ServerMessage, players::PlayerId}, network::{ game_interface::{InterfaceRequests, WsResponse}, room::{ RoomHandle, RoomMessage}}};
// use crate::game::logic::Game;
// use crate::game::logic::GamePhase;
// #[derive(Clone)]
// pub struct AppState {
//     pub game: Arc<RwLock<Game>>,
//     pub tx: broadcast::Sender<Event>,
// }

pub async fn ws_handler(ws: WebSocketUpgrade , State(interface_tx): State<mpsc::Sender<InterfaceRequests>>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, interface_tx))
}

pub async fn handle_socket(
    socket: WebSocket,
    interface_tx: mpsc::Sender<InterfaceRequests>,
) {

    let (mut ws_sender, mut ws_receiver) = socket.split();

    // network messages to browser
    let (tx, mut rx) = mpsc::unbounded_channel::<ServerMessage>();

    // runtime control messages
    let (ws_tx, mut ws_rx) = mpsc::channel::<WsResponse>(100);

    
    let mut room_handle: Option<RoomHandle> = None;
    let mut p_id: Option<PlayerId> = None;

    // connection getting hot
    let _ = interface_tx.send(
        InterfaceRequests::Connect {
            tx: tx.clone(),
            ws_tx,
        }
    ).await;

    // PURE writer task
    let writer = tokio::spawn(async move {

        while let Some(msg) = rx.recv().await {
            // println!("sending msg: {:?}", msg);

            let json =
                serde_json::to_string(&msg).unwrap();

            if ws_sender
                .send(Message::Text(json))
                .await
                .is_err()
            {
                break;
            }
        }
    });

    // MAIN SESSION LOOP
    loop {

        tokio::select! {

            // runtime/internal messages
            Some(msg) = ws_rx.recv() => {

                match msg {

                    WsResponse::Handle(handle) => {
                        room_handle = Some(handle);
                    }

                    WsResponse::RemoveHandle => {
                        room_handle = None;
                    }

                    WsResponse::Connected {
                        player_id,
                    } => {
                        // println!("runtime connected: {:?}", player_id);
                        p_id = Some(player_id);
                    }
                }
            }

            // browser websocket messages
            Some(Ok(msg)) = ws_receiver.next() => {

                match msg {

                    Message::Text(text) => {

                        if let Ok(req) =
                            serde_json::from_str::<ClientRequest>(&text) {
                            match req {

                                ClientRequest::InterfaceRequest(req) => {

                                    if let Some(id) = p_id {

                                        match req {

                                            InterfaceRequest::SetName { name } => {
                                                // println!("set name ws handler");
                                                let _ = interface_tx.send(
                                                    InterfaceRequests::SetName {
                                                        p_id: id,
                                                        name,
                                                        tx: tx.clone(),
                                                    }
                                                ).await;
                                            }

                                            InterfaceRequest::CreateRoom => {

                                                let _ = interface_tx.send(
                                                    InterfaceRequests::CreateRoom {
                                                        p_id: id,
                                                        interface_tx: interface_tx.clone(),
                                                        tx: tx.clone(),
                                                    }
                                                ).await;
                                            }

                                            InterfaceRequest::JoinRoom { r_id } => {

                                                let _ = interface_tx.send(
                                                    InterfaceRequests::JoinRoom {
                                                        p_id: id,
                                                        r_id,
                                                        tx: tx.clone(),
                                                    }
                                                ).await;
                                            }

                                            InterfaceRequest::LeaveRoom { r_id } => {

                                                let _ = interface_tx.send(
                                                    InterfaceRequests::LeaveRoom {
                                                        p_id: id,
                                                        r_id,
                                                        tx: tx.clone(),
                                                    }
                                                ).await;
                                            }
                                        }
                                    }
                                }

                                ClientRequest::Action { action } => {

                                    if let (Some(id), Some(handle)) =
                                        (p_id, &room_handle)
                                    {
                                        let _ = handle.tx.send(
                                            RoomMessage::RoomAction {
                                                p_id: id,
                                                action,
                                            }
                                        ).await;
                                    }
                                }
                            }

                        } else {

                            let _ = tx.send(
                                ServerMessage::Error {
                                    err: "Invalid message".into()
                                }
                            );
                        }

                    }

                    Message::Close(_) => {
                        break;
                    }

                    _ => {}
                }
            }

            else => {
                break;
            }
        }
    }

    // cleanup after disconnect

    if let (Some(handle), Some(id)) =
        (&room_handle, p_id)
    {
        let _ = handle.tx.send(
            RoomMessage::LeavePlayer {
                p_id: id,
            }
        ).await;
    }

    if let Some(id) = p_id {

        let _ = interface_tx.send(
            InterfaceRequests::Disconnect {
                p_id: id,
            }
        ).await;
    }



    writer.abort();
}

// pub async fn ws_handler(ws : WebSocketUpgrade , State(state) : State<AppState>) -> impl IntoResponse{ //why impl here ??
//     ws.on_upgrade(move |socket| handle_socket(socket, state))
// }

// async fn handle_socket(socket: WebSocket, state: AppState) {

//     // join
//     let (player_id, join_event) = {
//         let mut game = state.game.write().await;
//         match game.add_player() {
//             Some(Event::PlayerAdded { p_id }) => (p_id, Some(Event::PlayerAdded { p_id })),
//             _ => return,
//         }
//     };

//     if let Some(ev) = join_event {
//         let _ = state.tx.send(ev);
//     }

//     let mut rx = state.tx.subscribe();
//     let (sender, mut receiver) = socket.split();

//     let (out_tx, mut out_rx) = mpsc::unbounded_channel::<OutgoingMsg>();
//     // sending the id of player privately
//     let _ = out_tx.send(
//     OutgoingMsg::Private(
//         PrivateMsg::Id { p_id: player_id }
//             )
//     );
//     // ----- WRITING TASK -----
//     let writer_task = tokio::spawn(async move {
//         let mut sender = sender;

//         while let Some(msg) = out_rx.recv().await {
//             let json = match msg {
//                 OutgoingMsg::Public(ev) => serde_json::to_string(&ev).unwrap(),
//                 OutgoingMsg::Private(pm) => serde_json::to_string(&pm).unwrap(),
//             };

//             if sender.send(Message::Text(json)).await.is_err() {
//                 break;
//             }
//         }
//     });

//     // ---- BROADCAST LISTENER ------
//     let game_for_broadcast = state.game.clone();
//     let my_id = player_id;
//     let public_tx = out_tx.clone();

//     let broadcast_task = tokio::spawn(async move {
//         let mut hand_sent = false;

//         while let Ok(ev) = rx.recv().await {
//             // forward public event
//             let _ = public_tx.send(OutgoingMsg::Public(ev.clone()));

//             // send hand ONCE when StartGame is observed
//             if matches!(ev, Event::StartGame) && !hand_sent {
//                 let hand = {
//                     let game = game_for_broadcast.read().await;
//                     game.get_hand(my_id)
//                 };

//                 if let Some(cards) = hand {
//                     let _ = public_tx.send(
//                         OutgoingMsg::Private(
//                             PrivateMsg::Hand { cards }
//                         )
//                     );
//                     hand_sent = true; //sends cards exactly once
//                 }
//             }
//         }
//     });

//     // ---- RECEIVE TASK ----
//     let recv_task = {
//         let game = state.game.clone();
//         let tx = state.tx.clone();

//         tokio::spawn(async move {
//             while let Some(Ok(Message::Text(text))) = receiver.next().await {
//                 let Ok(action) = serde_json::from_str::<Action>(&text) else {
//                     continue;
//                 };

//                 let mut started_game = false;

//                 let events = {
//                     let mut game = game.write().await;

//                     let events = game.apply_action(action);

//                     // deal cards ONCE, globally
//                     if game.get_phase() == GamePhase::Playing && !game.cards_dealt() {
//                         game.start_game();
//                         started_game = true;
//                     }

//                     events
//                 };

//                 // broadcast action-generated events
//                 for ev in events {
//                     let _ = tx.send(ev);
//                 }

//                 // broadcast turn info ONCE
//                 if started_game {
//                     let (turn,seating, card_count) = {
//                         let game = game.read().await;
//                         (game.get_turn() , game.get_seats() , game.get_counts())
//                     };
//                     let _ = tx.send(Event::SeatOrder { seats: seating , counts: card_count});
//                     let _ = tx.send(Event::NextTurn { player_id: turn });
//                 }
//             }
//         })
//     };

//     // wait....
//     tokio::select! {
//         _ = writer_task => {},
//         _ = broadcast_task => {},
//         _ = recv_task => {},
//     }

//     // ---- LEAVE ----
//     let outcome = {
//         let mut g = state.game.write().await;
//         g.remove_player(player_id)
//     };

//     if let Some(ev) = outcome {
//         let _ = state.tx.send(ev);
//     }
// }


   