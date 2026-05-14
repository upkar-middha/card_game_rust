use crate::{Game, game::{logic::GamePhase, players::PlayerId}, network::game_interface::InterfaceRequests};
use tokio::sync::mpsc::{self, UnboundedSender};
use std::{collections::HashMap};
// use crate::network::Messages::OutgoingMsg;
use crate::game::event::ServerMessage;

//CHANGE IN LOGIC , THERE ARE ONLY 4 FIX IDS IN THAT  NEED TO CHANGE THAT // done

/*
Game -> ServerMessage -> using Individual Senders from send_to_player -> send to player 
RoomMessage -> using Receiver -> Room receives -> Apply on game */
pub struct Room {
    id : u32,
    // game instance , no need for mutex locks as synchronization is handled by tokio::mpsc
    game : Game,
    // unclonable receiver // only 1 per  room
    rx : mpsc::Receiver<RoomMessage>,
    // tx : mpsc::Sender<RoomMessage>,
    // Sender to each player , easier to send private messages
    interface_tx : mpsc::Sender<InterfaceRequests>, // interface to room
    send_to_player : HashMap<PlayerId , mpsc::UnboundedSender<ServerMessage>>

    // tx : mpsc::Sender<ClientRequest>
}

impl Room {
    pub fn new(id : u32 , interface_tx : mpsc::Sender<InterfaceRequests>) -> (Self , RoomHandle) {
        let (tx , rx) = mpsc::channel(100); // send - recv  channel with q.len = 100
        let room = Self {
            id,
            game: Game::new(),
            rx,
            interface_tx,
            send_to_player:HashMap::new()
        };
        (room , RoomHandle{tx})
    }
    // Consumer of RoomMessages and execute them sequentially
    pub async fn run(&mut self) {

        while let Some(msg) = self.rx.recv().await {

            match msg {

                RoomMessage::JoinPlayer {
                    p_id,
                    name,
                    tx,
                } => {
                    if self.game.get_player_count() >= 4 {
                        let _ = self.interface_tx.send(InterfaceRequests::RoomIsFull { tx }).await;
                        continue;
                    }
                    if self.game.get_phase() == GamePhase::Playing {
                        let _ = self.interface_tx.send(InterfaceRequests::GameStarted { tx }).await;
                        continue;
                    }
                    // println!("adding player : {name}");
                    self.send_to_player.insert(p_id, tx.clone());
                    let s_msg = self.game.add_player(p_id , name);
                    let _ = self.interface_tx.send(InterfaceRequests::RoomJoinSuccess { p_id, r_id: self.id.clone(), tx:tx.clone() }).await;
                    self.send(s_msg);
                }

                RoomMessage::LeavePlayer {
                    p_id,
                } => {

                    self.send_to_player.remove(&p_id);
                    let s_msg = self.game.remove_player(p_id);
                    self.send(s_msg);

                    // shutdown room if empty
                    // if a player is in room and exits while game is paused than remove player from room
                    if self.send_to_player.is_empty() {
                        let _ = self.interface_tx.send(InterfaceRequests::RoomClose { r_id: self.id }).await;
                        self.cleanup();
                        break;
                    }
                }

                RoomMessage::RoomAction {
                    p_id,
                    action,
                } => {

                    let s_msg = self.game.apply_action(action, p_id);

                    self.send(s_msg);
                }
            }
        }

        // cleanup logic here
    }

    pub fn cleanup(&mut self) {
        self.send_to_player.clear();
    }

    pub fn send(&mut self, s_msg: Vec<ServerMessage>) {
        for msg in s_msg {
            match msg {

                ServerMessage::Event(event) => {
                    for (_, tx) in &self.send_to_player {
                        let _ = tx.send(
                            ServerMessage::Event(event.clone())
                        );
                    }
                }

                ServerMessage::PrivateMsg(private_msg) => {
                    let target = private_msg.target();

                    if let Some(tx) = self.send_to_player.get(&target) {
                        let _ = tx.send(
                            ServerMessage::PrivateMsg(private_msg)
                        );
                    }
                }

                 _ => {}
            }
        }
    }

}
#[derive(Clone)]
pub struct RoomHandle {
    pub tx: mpsc::Sender<RoomMessage>,
}

pub enum RoomMessage {
    JoinPlayer {
        p_id : PlayerId,
        name : String,
        tx : UnboundedSender<ServerMessage>
    },

    LeavePlayer {
        p_id : PlayerId
    },

    RoomAction {
        p_id : PlayerId,
        action : crate::game::actions::Action
    },
}