use crate::game::{card::Card, players::PlayerId};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub enum Action {
    // StartGame,
    // AbortGame,
    EndGame,

    // AddPlayer { player_id: PlayerId },
    // RemovePlayer { player_id: PlayerId },

    CardPlayedByPlayer {
        player_id: PlayerId,
        card: Card,
    },

    Ready {
        player_id : PlayerId
    }

}