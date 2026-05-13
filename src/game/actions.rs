use crate::{game::card::Card};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub enum Action {
    // StartGame,
    // AbortGame,
    // EndGame,

    // AddPlayer { player_id: PlayerId },
    // RemovePlayer { player_id: PlayerId },

    CardPlayedByPlayer {
        // player_id: PlayerId, connection will be Source Of Truth for id
        card: Card,
    },

    Ready,

}
#[derive(Debug, Deserialize)]
pub enum InterfaceRequest {
    SetName {name : String},
    CreateRoom,
    JoinRoom {r_id : u32},
    LeaveRoom {r_id : u32},
}

#[derive(Debug, Deserialize)]
pub enum ClientRequest {
    InterfaceRequest(InterfaceRequest),
    Action{action : Action},

}