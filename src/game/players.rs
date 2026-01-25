use crate::game::card::Card;
use std::hash::Hash;
use serde::{Serialize, Deserialize};

#[derive(
    Debug,
    Copy,
    Clone,
    Eq,
    PartialEq,
    Hash,
    Serialize,
    Deserialize
)]
pub struct PlayerId(pub u32);

// impl PartialEq<u32> for PlayerId {
//     fn eq(&self, other: &u32) -> bool {
//         self.0 == *other
//     }
// }

pub struct Players {
    pub id: PlayerId,
    pub hand: Vec<Card>,
    pub ready : bool,
}

impl Players {
    pub fn new(id: PlayerId) -> Self {
        Self {
            id,
            hand: Vec::new(),
            ready : false,
        }
    }

    pub fn remove_card(&mut self, card: &Card) -> Option<Card> {
        let idx = self.hand.iter().position(|c| c == card)?;
        return Some(self.hand.swap_remove(idx));
        // if let Some(idx) = self.hand.iter().position(|c| c == card) {
        //     Some(self.hand.swap_remove(idx))
            
        // } else {
        //     None
        // }
    }
}
