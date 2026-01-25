use crate::game::card::Card;
use crate::game::players::PlayerId;
use serde::Serialize;
#[derive(Clone, Serialize)]
pub enum Event {
    StartGame,

    AbortGame,

    EndGame{p_id : PlayerId},

    CardPlayed{card : Card , p_id : PlayerId},

    NextTurn {
        player_id: PlayerId,
    },

    FoulGiven {
        from: PlayerId,
        to: PlayerId,
        cards : Vec<Card>,
    },

    DiscardPile,

    // DistributeCards{
    //     p_id : PlayerId,
    //     cards : Vec<Card>,
    // },

    PlayerWon {
        player_id: PlayerId,
    },

    // PlayerRemoved{
    //     p_id : PlayerId,
    // },

    SpecialEvent {p_id : PlayerId , card : Card , from : PlayerId},
    PlayerAdded{p_id : PlayerId},

    InvalidCard {p_id : PlayerId},

    InvalidPlayer,

    // NotEnoughPlayers,

    // MaxPlayers,

    PlayerLeft {p_id : PlayerId},

    Error {
        message: String,
    },
    MarkReady {p_id : PlayerId}

}
#[derive(Serialize)]
pub enum PrivateMsg {
    Hand {cards : Vec<Card>}
}
