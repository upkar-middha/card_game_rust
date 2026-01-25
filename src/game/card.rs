use rand::Rng;
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
pub enum Suit{
    Spade,
    Heart,
    Diamond,
    Club,
}
#[derive(
    Debug,
    Copy,
    Clone,
    Eq,
    PartialEq,
    Hash,
    Serialize,
    Deserialize,
    PartialOrd,
    Ord
)]
pub enum Rank{
    Two = 2,
    Three = 3,
    Four = 4,
    Five = 5,
    Six = 6,
    Seven = 7,
    Eight = 8,
    Nine = 9,
    Ten = 10,
    Jack = 11,
    Queen = 12,
    King = 13,
    Ace = 14,
}

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
pub struct Card{
    pub rank : Rank,
    pub suit : Suit,
}

// impl Card{
//     pub fn is_smaller(&self , other : &Card) -> bool{
//         self.rank < other.rank
//     }
//     pub fn is_valid(&self , other : &Card) -> bool{
//         self.suit == other.suit
//     }
// }

pub fn standard_deck() -> Vec<Card> {
    let mut deck = Vec::with_capacity(52);

    let suits = [
        Suit::Heart,
        Suit::Diamond,
        Suit::Club,
        Suit::Spade,
    ];

    let ranks = [
        Rank::Two,
        Rank::Three,
        Rank::Four,
        Rank::Five,
        Rank::Six,
        Rank::Seven,
        Rank::Eight,
        Rank::Nine,
        Rank::Ten,
        Rank::Jack,
        Rank::Queen,
        Rank::King,
        Rank::Ace,
    ];

    for suit in suits {
        for rank in ranks {
            deck.push(Card { suit, rank });
        }
    }

    deck
}
pub fn shuffle(cards: &mut Vec<Card>) {
    let mut rng = rand::rng();
    let n = cards.len();

    for i in (1..n).rev() {
        let j = rng.random_range(0..=i);
        cards.swap(i, j);
    }
}
