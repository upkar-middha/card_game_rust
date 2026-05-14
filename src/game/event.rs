use crate::game::card::Card;
use crate::game::players::PlayerId;
use serde::Serialize;
#[derive(Clone, Serialize,Debug)]
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


    PlayerWon {
        player_id: PlayerId,
    },


    SpecialEvent {p_id : PlayerId , card : Card , from : PlayerId},
    PlayerAdded{p_id : PlayerId , name : String}, // it's a room message though

    

    InvalidPlayer,


    PlayerLeft {p_id : PlayerId},

    Error {
        message: String,
    },
    MarkReady {p_id : PlayerId},

    SeatOrder {seats : Vec<PlayerId> , counts : Vec<u32>},

}
#[derive(Serialize,Debug)]
pub enum PrivateMsg {
    Hand {cards : Vec<Card> , p_id : PlayerId},
    // Id {p_id : PlayerId},

    InvalidCard {p_id : PlayerId},

    SnapShot {p_ids : Vec<PlayerId> , names : Vec<String> , to : PlayerId},

    // RoomCreated {room_id : u32 , p_id : PlayerId},
}

#[derive(Serialize,Debug)]
pub enum ServerMessage {
    PrivateMsg(PrivateMsg),
    Event(Event),
    Connected {p_id : PlayerId},
    NameRegistered,
    RoomCreated {r_id : u32},
    RoomJoined {r_id : u32},
    Error{err : String},
}


impl PrivateMsg {
    pub fn target(&self) -> PlayerId {
        match self {
            PrivateMsg::Hand { p_id, .. } => *p_id,
            PrivateMsg::SnapShot { to, .. } => *to,
            // PrivateMsg::Id { p_id } => *p_id,
            PrivateMsg::InvalidCard { p_id } => *p_id,
            // PrivateMsg::RoomCreated { room_id,  p_id } => *p_id,
        }
    }
}