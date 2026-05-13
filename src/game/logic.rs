use crate::game::card::Rank;
use crate::game::card::Suit;
use crate::game::event::PrivateMsg;
use crate::game::event::ServerMessage;
use crate::game::players::PlayerId;
use crate::game::actions::Action;
use crate::game::event::Event;
use crate::game::players::Players;
use crate::game::card::Card;
use crate::game::card::shuffle;
use crate::game::card::standard_deck;
// use std::collections::HashSet;

// set line 231 ;;;; 323 too , first card must be played as ace of spade , i need to ensure that // done
// for reset game design, player knowledge must be mainted , instead of removing players from the stack . mark them as eliminated
// then change the code for next turn as winner functon as well as some other things to ensure correctness

use rand::Rng;
#[repr(u8)]
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum GamePhase{

    Waiting = 0,
    Playing = 1,
    // Ended = 2,
}
pub struct Game{
    phase : GamePhase,
    turn : PlayerId,
    turn_stack : Vec<(Card , PlayerId)>,
    players : Vec<Players>, // ready ko false krna h
    deck : Vec<Card>,
    first : PlayerId,
    // id_set : HashSet<PlayerId>, // REMOVE IT , NOT NECESSARY AND CHANGE LOGIC 
    hand_dealt : bool, // isko false in reset
    first_move : bool, // isko false in reset
    // iter : u32,
}

impl Game{

    // dead code
    // pub async fn run(mut self , mut rx: UnboundedReceiver<Action>){
    //     while let Some(action) = rx.recv().await {
    //         let events = self.apply_action(action);

    //     for event in events {
    //         event_tx.send(event).unwrap();
    //         }
    //     }
    // }

    pub fn new() -> Self {
        // let id_set : HashSet<PlayerId> = [
        //     PlayerId(0),
        //     PlayerId(1),
        //     PlayerId(2),
        //     PlayerId(3),
        // ]
        // .into_iter()
        // .collect();

        Self{
            phase : GamePhase::Waiting,
            turn_stack : Vec::new(),
            players : Vec::new(),
            deck : Vec::new(),
            first : PlayerId(0),
            turn : PlayerId(0),
            // iter : 0,
            // id_set,
            hand_dealt : false,
            first_move : false,
        }
    }

    fn reset(&mut self) {
        self.phase = GamePhase::Waiting;
        self.deck = standard_deck();
        self.hand_dealt = false;
        self.turn_stack.clear();
        self.first_move = false;

        // for i in 0..4 {
        //     self.id_set.insert(PlayerId(i));
        // }

        for player in &mut self.players {
            player.hand.clear();
            player.player_state = super::players::PlayerState::InGame;
        }

    }

    // pub fn total_players(& self) -> usize {
    //     self.players.len()
    // }

    // pub fn get_player(&self, p_id: PlayerId) -> Option<&Players> {
    //     self.players.iter().find(|p| p.id == p_id)
    // }

    /// adds a player without checking , guard rails must be implemented in upper layer...
    pub fn add_player(&mut self , id : PlayerId , name : String) -> Vec<ServerMessage> {

        // let id = self.id_set.iter().next().copied()?;
        // self.id_set.remove(&id);

        self.players.push(Players::new(id , name.clone()));
        vec![ServerMessage::Event(Event::PlayerAdded { p_id: id , name : name.clone()}),
             ServerMessage::PrivateMsg(PrivateMsg::SnapShot { p_ids: self.players.iter().map(|p| p.id).collect() , names : self.players.iter().map(|p| p.name.clone()).collect() , to : id})]
    }

    pub fn remove_player(&mut self, player_id: PlayerId) -> Vec<ServerMessage> {
        // if player_id.0 >= 4 || self.id_set.contains(&player_id){
        //     return None;
        // }

        // not an issue now , Invariant ensured in upper layer
        // if !self.players.iter().any(|p| p.id == player_id) {
        //     return vec![ServerMessage::Event(Event::PlayerNotFound)];
        // }

        if self.phase == GamePhase::Playing {
            return vec![ServerMessage::Event(Event::AbortGame)];
        }

        // if player_id.0 >= 4 {
        //     return false;
        // }

        // if self.id_set.contains(&player_id) {
        //     return false; 
        // }
        self.players.retain(|p| p.id != player_id);
        return vec![ServerMessage::Event(Event::PlayerLeft { p_id: player_id })];
    }

    pub fn get_phase(& self) -> GamePhase{
        self.phase
    }

    // pub fn get_seats(& self) -> Vec<PlayerId> {
    //     self.players.iter().map(|p| p.id).collect()
    // }

    // /// returns true if cards are dealt else returns false
    // pub fn cards_dealt(& self) -> bool {
    //     return self.hand_dealt;
    // }

    // pub fn get_turn(& self) -> PlayerId {
    //     self.turn
    // }

    pub fn start_game(&mut self) {
        self.reset();

        shuffle(&mut self.deck);
        self.distribute();

        self.hand_dealt = true;

        let first = self.find_ace_of_spades_holder()
            .expect("there must be a player with Ace of Spade");

        self.turn = first;
        self.first = first;
    }

    // pub fn get_hand(&self, player_id: PlayerId) -> Option<Vec<Card>> {
    //     self.players
    //         .iter()
    //         .find(|p| p.id == player_id)
    //         .map(|p| p.hand.clone())
    // }

    pub fn get_counts(&self) -> Vec<u32> {
        self.players
        .iter()
        .filter(|p| !p.hand.is_empty())
        .map(|p| p.hand.len() as u32)
        .collect()
    }

    pub fn un_ready_all(&mut self) {
        for player in &mut self.players {
            player.ready = false;
        }
    }

    pub fn add_start_events(&mut self , v :&mut Vec<ServerMessage>) {
        let seats = self.players.iter().map(|p| p.id).collect();
        let count = self.get_counts();

        // send ids (table view) broadcast and card count
        v.push(ServerMessage::Event(Event::SeatOrder { seats , counts: count }));


        // send hand corresponding to each id (private msg)
        for player in  &self.players {
            v.push(ServerMessage::PrivateMsg(super::event::PrivateMsg::Hand { cards: player.hand.clone(), p_id: player.id }));
        }

    }



    pub fn apply_action(&mut self, action: Action , player_id : PlayerId) -> Vec<ServerMessage> {
        match action {
            Action::Ready => {
                let mut v : Vec<ServerMessage> = Vec::new();
                if self.phase != GamePhase::Waiting {
                    return v;
                }
                if !self.mark_ready(player_id) {
                    return v;
                }

                v.push(ServerMessage::Event(Event::MarkReady { p_id: player_id }));

                if self.all_ready() {
                    self.phase = GamePhase::Playing;
                    v.push(ServerMessage::Event(Event::StartGame));
                    self.start_game(); // nice error , swapped start game and add start events , 12 -05 - 2026
                    self.add_start_events(&mut v);
                    v.push(ServerMessage::Event(Event::NextTurn { player_id: self.turn.clone() }))
                    
                }
                return v;
            }
            // Action::StartGame => {
            //     if self.players.len() < 2 {
            //         vec![
            //             Event::NotEnoughPlayers
            //         ];
            //     }

            //     if self.phase == GamePhase::Playing {
            //         return vec![Event::Error{message : "game already started".into()}]
            //     }

            //     self.phase = GamePhase::Playing;

            //     shuffle(&mut self.deck);
            //     // todo!("handle distribute_card \{ p_id , hand \} event in this")
            //     self.distribute();

            //     if let Some(player_id) = self.find_ace_of_spades_holder() {
            //         self.turn = player_id;
            //     } 
            //     else {
            //         // This should never happen with a standard deck
            //         // but don't crash the server
            //         return vec![Event::Error{message:"Ace of Spades not found".into()}];
            //         }
            //     self.first = self.turn;
            //     vec![
            //         Event::StartGame,
            //         Event::NextTurn {
            //             player_id: self.turn,
            //         },
            //     ]
            // }
            
            // Action::EndGame => {
            //     self.phase = GamePhase::Waiting;
            //     return vec![];
            // }

            Action::CardPlayedByPlayer {card } => {

                // println!(
                // "players = {:?}, incoming = {:?}",
                // self.players.iter().map(|p| p.id).collect::<Vec<_>>(),
                // player_id
                // );



                // 1. Find player (change : '1' and '2' must be checked before)
                let player = match self.players.iter_mut().find(|p| p.id == player_id) {
                    Some(p) => p,
                    None => {
                        return vec![ServerMessage::Event(Event::Error {
                            message: "Player not found".to_string(), // or into();
                        })];
                    }
                };
         
                //2. Check if its player's turn or not
                if self.turn != player.id {
                    return vec![ServerMessage::Event(Event::InvalidPlayer)];
                }

                //0. first card must be ace of spade
         
                if self.first_move == false {
                    if card.rank != Rank::Ace || card.suit != Suit::Spade {
                        return vec![ServerMessage::PrivateMsg(PrivateMsg::InvalidCard { p_id: (player_id) })]
                    }
                    else {
                        self.first_move = true;
                    }
                }
          
                // // 1. Find player
                // let player = match self.players.iter_mut().find(|p| p.id == player_id) {
                //     Some(p) => p,
                //     None => {
                //         return vec![Event::Error {
                //             message: "Player not found".to_string(), // or into();
                //         }];
                //     }
                // };
         
                // //2. Check if its player's turn or not
                // if self.turn != player.id {
                //     return vec![Event::InvalidPlayer];
                // }
          
                // 3. Check if card exists in hand

                if !player.hand.iter().any(|c| *c == card) {
                    return vec![ServerMessage::Event(Event::AbortGame)];
                }

                let pos = match self.players.iter().position(|p| p.id == player_id) {
                    Some(i) => i,
                    None => {
                        return vec![ServerMessage::Event(Event::InvalidPlayer)];
                    }
                };

                // let next_turn = self.players[(pos+1)%self.players.len()].id; change here
                let next_turn = self.next_active(pos).expect("there should always be another active player");

                // first turn
                if self.turn_stack.len() == 0 {
                    self.turn_stack.push((Players::remove_card(&mut self.players[pos] , &card).expect("player played a valid card")
 , player_id));
                    // self.players[pos].hand.remove(self.players[pos].hand.iter().position(|c| *c == card).unwrap());
                    self.turn = next_turn;
                    return vec![ServerMessage::Event(Event::CardPlayed{card : card , p_id : player_id }) , ServerMessage::Event(Event::NextTurn { player_id:next_turn })];
                }

                // not first turn
                let mut res:Vec<ServerMessage> = Vec::new();
                if let Some((top_card , __p_id)) =  self.turn_stack.last() {
                    // played card has same suit as top
                    if card.suit == top_card.suit {
                        self.turn_stack.push((Players::remove_card(&mut self.players[pos], &card).expect("already checked card exists at L136") , player_id));

                        res.push(ServerMessage::Event(Event::CardPlayed { card : card , p_id : player_id }));

                        // one turn completed
                        if next_turn == self.first {
                            self.check_turn();
                            self.first = self.turn;
                            res.push(ServerMessage::Event(Event::DiscardPile));
                            self.turn_stack.clear();
                            let winners = self.check_winner();
                            
                            // self.players.retain(|p| !winners.contains(&p.id)); change here , player marked as winner

                            for winner in winners {
                                res.push(ServerMessage::Event(Event::PlayerWon { player_id : winner }));
                            }

                            if self.active_len() == 1 {
                                let loser = self.players
                                    .iter()
                                    .find(|p| p.player_state == super::players::PlayerState::InGame)
                                    .expect("there should be one active player left")
                                    .id;

                                res.push(ServerMessage::Event(Event::EndGame { p_id: loser }));
                                self.un_ready_all();
                                self.reset();
                                return res;
                            }

                            let pos = self.players.iter().position(|p| p.id == self.turn).expect("there is at least two players");
                            // split at mut to use two mutable reference from same instance // not needed now  
                            if self.players[pos].hand.is_empty() {
                                let curr_pos = pos;
                                let next_player_id = self
                                    .next_active(pos)
                                    .expect("2 players should exist by invariant");

                                let next_pos = self.players
                                    .iter()
                                    .position(|p| p.id == next_player_id)
                                    .expect("next active player must exist in players");
                                                                
                                let c = self.give_random_card(curr_pos , next_pos);
                                // IF NEXT PLAYER HAS ONLY ONE CARD LEFT , THIS PLAYER JUST LOST , CUZ IT WILL RECV THAT CARD
                                
                                res.push(ServerMessage::Event(Event::SpecialEvent { p_id: (player_id), card : c, from: (self.players[next_pos].id) }) );
                            }
                        }
                        else{
                            self.turn = next_turn;
                        }
                        res.push(ServerMessage::Event(Event::NextTurn { player_id : self.turn }));

                        return res;
                    } 
                    // played card has different suit , means a foul or player lie
                    else{
                        //check if player lying
                        let (top_card , __p_id) = self.turn_stack.last().expect("can't be none as turn stack is checked");
                        let exist = self.players[pos].hand.iter().any(|c| c.suit == top_card.suit);
                        if exist {
                            return vec![ServerMessage::PrivateMsg(PrivateMsg::InvalidCard {p_id : player_id})];
                        }
                        // player played a valid foul , give all cards in turn stack to the playerid who played highest card
                        let played = Players::remove_card(&mut self.players[pos], &card)
                                                    .expect("card exists in hand (checked earlier)");
                        res.push(ServerMessage::Event(Event::CardPlayed { card : card, p_id: player_id }));
                    
                        let p_id = self.turn_stack.iter().max_by_key(|(c , __) | c.rank).expect("stack is not empty").1;
                        let mut foul:Vec<Card> = self.turn_stack.drain(..).map(|(c , __)| c).collect();
                        foul.push(played);

                        res.push(ServerMessage::Event(Event::FoulGiven { from: (player_id), to: (p_id), cards: foul.clone() }));
                        res.push(ServerMessage::Event(Event::DiscardPile));
                        self.add_cards_to_player(&p_id, foul);
                        self.turn = p_id;
                        self.first = self.turn; // nice error diddy
                        // give foul as well as turn to next player , check winners and game end, no need to check exception condition as players hands gonna be full after a foul
                        let winners = self.check_winner(); //change , done
                            
                        // self.players.retain(|p| !winners.contains(&p.id)); change

                        for winner in winners {
                            res.push(ServerMessage::Event(Event::PlayerWon { player_id : winner }));
                        }

                        if self.active_len() == 1 {
                                let loser = self.players
                                    .iter()
                                    .find(|p| p.player_state == super::players::PlayerState::InGame)
                                    .expect("there should be one active player left")
                                    .id;

                                res.push(ServerMessage::Event(Event::EndGame { p_id: loser }));
                                self.un_ready_all();
                                self.reset();
                                return res;
                            }

                        res.push(ServerMessage::Event(Event::NextTurn { player_id : self.turn }));
                        return res;
                    }
                }
                return vec![];
            }
        }
    }
    pub fn distribute(&mut self) {
        let n = self.players.len();

        let mut i = 0;

        while let Some(card) = self.deck.pop() {
            let player = &mut self.players[i % n];
            player.hand.push(card);
            i += 1;
        }
    }
    /// return count of players left in game (not won)
    pub fn active_len(&self) -> usize{
        return self.players.iter().filter(|p| p.player_state == super::players::PlayerState::InGame).count();
    }

    pub fn mark_ready(& mut self , p_id : PlayerId) -> bool {
        
        if self.players.len() == 1 {
            return false;
        }
        if let Some(p) = self.players.iter_mut().find(|p| p.id == p_id) {
            p.ready = true;
            return true;
        }
        false
    }


    fn all_ready(&self) -> bool {
        self.players.len() > 1 && self.players.iter().all(|p| p.ready)
    }

    fn find_ace_of_spades_holder(&self) -> Option<PlayerId> {
        for player in &self.players {
            if player.hand.iter().any(|card| {
                card.suit == crate::game::card::Suit::Spade && card.rank == crate::game::card::Rank::Ace
            }) {
                return Some(player.id);
            }
        }
        None
    }

    fn find_by_player_id(&self, player_id: PlayerId) -> Option<usize> {
        self.players
            .iter()
            .position(|p| p.id == player_id)
    }


    fn add_cards_to_player(&mut self , player_id : &PlayerId ,mut cards : Vec<Card>) {
        if let Some(p_id) = self.find_by_player_id(*player_id) {
            self.players[p_id].hand.append(&mut cards);
        }
    }
    /// assigns next turn 
    fn check_turn(&mut self) {
        
        self.turn = self.turn_stack.iter().max_by_key(|(c , _)| c.rank).expect("return a valid person to receive turn").1;
    }

    // fn check_winner(&mut self)-> Vec<PlayerId>{
    //     self.players.iter().filter(|p| p.hand.is_empty() && self.turn != p.id).map(|p| p.id).collect()
    // }
    /// Mark and return players that are "in game" , with "empty hand"(given its not their turn , else it triggers a special event)
    fn check_winner(&mut self) -> Vec<PlayerId> {
        let winners: Vec<PlayerId> = self.players
            .iter()
            .filter(|p| {
                p.hand.is_empty() && self.turn != p.id && p.player_state == super::players::PlayerState::InGame
            })
            .map(|p| p.id)
            .collect();

        for winner in &winners {
            if let Some(player) = self.players.iter_mut().find(|p| p.id == *winner) {
                player.player_state = super::players::PlayerState::Won;
            }
        }

        winners
    }

    fn next_active(&self, pos: usize) -> Option<PlayerId> {
        let n = self.players.len();

        for i in 1..n {
            let idx = (pos + i) % n;

            if self.players[idx].player_state == super::players::PlayerState::InGame {
                return Some(self.players[idx].id);
            }
        }

        None
    }

    pub fn give_random_card(&mut self , to : usize ,from :usize) -> Card {
        assert!(to != from, "cannot give card to same player");
        let mut rng = rand::rng();
        let size = self.players[from].hand.len();

        let idx = rng.random_range(0..size);
        
        let card = self.players[from].hand.swap_remove(idx);

        self.players[to].hand.push(card.clone());
        card
    }

    pub fn get_player_count(& self) -> usize {
        self.players.len()
    }
}


// #[cfg(test)]
// mod tests {
//     use super::*;

//     #[test]
//     fn add_players_and_print_hands() {
//         let mut game = Game::new();

//         // add 4 players
//         for i in 0..4 {
//             game.add_player(PlayerId(i));
//         }

//         // mark all ready
//         for i in 0..4 {
//             game.mark_ready(PlayerId(i));
//         }

//         // start game
//         let mut events = Vec::new();
//         game.start_game(&mut events);

//         // print hands
//         for i in 0..4 {
//             let player_id = PlayerId(i);

//             let hand = game
//                 .get_hand(player_id)
//                 .expect("player should exist");

//             println!("Player {:?} hand:", player_id);

//             for card in &hand {
//                 println!("{:?}", card);
//             }

//             println!("-------------------");
//         }

//         // optional sanity check
// assert_eq!(game.players.len(), 4);

// println!("Current turn: {:?}", game.get_turn());
//     }
// }