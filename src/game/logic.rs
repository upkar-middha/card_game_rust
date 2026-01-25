use crate::game::card::Rank;
use crate::game::card::Suit;
use crate::game::players::PlayerId;
use crate::game::actions::Action;
use crate::game::event::Event;
use crate::game::players::Players;
use crate::game::card::Card;
use crate::game::card::shuffle;
use crate::game::card::standard_deck;
use std::collections::HashSet;

// set line 231 ;;;; 323 too , first card must be played as ace of spade , i need to ensure that 
// for reset game design player knowledge must be mainted , instead of removing players from the stack . mark them as eliminated
// then change the code for next turn as winner functon as well as some other things to ensure correctness

use rand::Rng;
#[repr(u8)]
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum GamePhase{

    Waiting = 0,
    Playing = 1,
    Ended = 2,
}
pub struct Game{
    phase : GamePhase,
    turn : PlayerId,
    turn_stack : Vec<(Card , PlayerId)>,
    players : Vec<Players>,
    deck : Vec<Card>,
    first : PlayerId,
    id_set : HashSet<PlayerId>,
    hand_dealt : bool,
    first_move : bool,
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
        let id_set : HashSet<PlayerId> = [
            PlayerId(0),
            PlayerId(1),
            PlayerId(2),
            PlayerId(3),
        ]
        .into_iter()
        .collect();

        Self{
            phase : GamePhase::Waiting,
            turn_stack : Vec::new(),
            players : Vec::new(),
            deck : Vec::new(),
            first : PlayerId(0),
            turn : PlayerId(0),
            // iter : 0,
            id_set,
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

        for i in 0..4 {
            self.id_set.insert(PlayerId(i));
        }

        for player in &mut self.players {
            player.hand.clear();
        }

    }

    // pub fn total_players(& self) -> usize {
    //     self.players.len()
    // }

    // pub fn get_player(&self, p_id: PlayerId) -> Option<&Players> {
    //     self.players.iter().find(|p| p.id == p_id)
    // }

    pub fn add_player(&mut self) -> Option<Event> {
        if self.phase != GamePhase::Waiting || self.players.len() == 4{
            return None;
        }

        let id = self.id_set.iter().next().copied()?;
        self.id_set.remove(&id);
        self.players.push(Players::new(id));
        Some(Event::PlayerAdded { p_id: id })
    }

    pub fn remove_player(&mut self, player_id: PlayerId) -> Option<Event> {
        if player_id.0 >= 4 || self.id_set.contains(&player_id){
            return None;
        }

        if self.phase == GamePhase::Playing {
            return Some(Event::AbortGame);
        }

        // if player_id.0 >= 4 {
        //     return false;
        // }

        // if self.id_set.contains(&player_id) {
        //     return false; 
        // }

        self.id_set.insert(player_id);
        self.players.retain(|p| p.id != player_id);
        return Some(Event::PlayerLeft { p_id: player_id })
    }

    pub fn get_phase(& self) -> GamePhase{
        self.phase
    }

    /// returns true if cards are dealt else returns false
    pub fn cards_dealt(& self) -> bool {
        return self.hand_dealt;
    }

    pub fn get_turn(& self) -> PlayerId {
        self.turn
    }

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

    pub fn get_hand(&self, player_id: PlayerId) -> Option<Vec<Card>> {
        self.players
            .iter()
            .find(|p| p.id == player_id)
            .map(|p| p.hand.clone())
    }



    pub fn apply_action(&mut self, action: Action) -> Vec<Event> {
        match action {
            Action::Ready { player_id } => {
                let mut v : Vec<Event> = Vec::new();
                if self.phase != GamePhase::Waiting {
                    return v;
                }
                if !self.mark_ready(player_id) {
                    return v;
                }

                v.push(Event::MarkReady { p_id: player_id });

                if self.all_ready() {
                    self.phase = GamePhase::Playing;
                    v.push(Event::StartGame);
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
            
            Action::EndGame => {
                self.phase = GamePhase::Waiting;
                return vec![];
            }

            Action::CardPlayedByPlayer { player_id, card } => {
                //0. first card must be ace of spade
         
                if self.first_move == false {
                    if card.rank != Rank::Ace || card.suit != Suit::Spade {
                        return vec![Event::InvalidCard { p_id: (player_id) }]
                    }
                    else {
                        self.first_move = true;
                    }
                }
          
                // 1. Find player
                let player = match self.players.iter_mut().find(|p| p.id == player_id) {
                    Some(p) => p,
                    None => {
                        return vec![Event::Error {
                            message: "Player not found".to_string(), // or into();
                        }];
                    }
                };
         
                //2. Check if its player's turn or not
                if self.turn != player.id {
                    return vec![Event::InvalidPlayer];
                }
          
                // 3. Check if card exists in hand

                if !player.hand.iter().any(|c| *c == card) {
                    return vec![Event::AbortGame];
                }

                let pos = match self.players.iter().position(|p| p.id == player_id) {
                    Some(i) => i,
                    None => {
                        return vec![Event::InvalidPlayer];
                    }
                };

                let next_turn = self.players[(pos+1)%self.players.len()].id;

                // first turn
                if self.turn_stack.len() == 0 {
                    self.turn_stack.push((Players::remove_card(&mut self.players[pos] , &card).expect("player played a valid card")
 , player_id));
                    // self.players[pos].hand.remove(self.players[pos].hand.iter().position(|c| *c == card).unwrap());
                    self.turn = next_turn;
                    return vec![Event::CardPlayed{card : card , p_id : player_id } , Event::NextTurn { player_id:next_turn }]
                }
                
                let mut res:Vec<Event> = Vec::new();
                if let Some((top_card , __p_id)) =  self.turn_stack.last() {
                    // played card has same suit as top
                    if card.suit == top_card.suit {
                        self.turn_stack.push((Players::remove_card(&mut self.players[pos], &card).expect("already checked card exists at L136") , player_id));

                        res.push(Event::CardPlayed { card : card , p_id : player_id });

                        if next_turn == self.first {
                            self.check_turn();
                            self.first = self.turn;
                            res.push(Event::DiscardPile);
                            self.turn_stack.clear();
                            let winners = self.check_winner();
                            
                            self.players.retain(|p| !winners.contains(&p.id));

                            for winner in winners {
                                res.push(Event::PlayerWon { player_id : winner });
                            }

                            if self.players.len() == 1 {
                                res.push(Event::EndGame { p_id: self.players.first().expect("last players").id });
                                self.reset();
                                return res;
                            }

                            let pos = self.players.iter().position(|p| p.id == self.turn).expect("there is at least two players");
                            // split at mut to use two mutable reference from same instance // not needed now ,, i am smart 
                            if self.players[pos].hand.is_empty() {
                                let curr_pos = pos;
                                let next_pos = (pos+1)%self.players.len();
                                let c = self.give_random_card(curr_pos , next_pos);
                                
                                res.push(Event::SpecialEvent { p_id: (player_id), card : c, from: (self.players[next_pos].id) });
                            }
                        }
                        else{
                            self.turn = next_turn;
                        }
                        res.push(Event::NextTurn { player_id : self.turn });

                        return res;
                    } 
                    // played card has different suit , means a foul or player lie
                    else{
                        //check if player lying
                        let (top_card , __p_id) = self.turn_stack.last().expect("can't be none as turn stack is checked");
                        let exist = self.players[pos].hand.iter().any(|c| c.suit == top_card.suit);
                        if exist {
                            return vec![Event::InvalidCard {p_id : player_id}];
                        }
                        // player played a valid foul , give all cards in turn stack to the playerid who played highest card
                        let played = Players::remove_card(&mut self.players[pos], &card)
                                                    .expect("card exists in hand (checked earlier)");
                        res.push(Event::CardPlayed { card : card, p_id: player_id });
                    
                        let p_id = self.turn_stack.iter().max_by_key(|(c , __) | c.rank).expect("stack is not empty").1;
                        let mut foul:Vec<Card> = self.turn_stack.drain(..).map(|(c , __)| c).collect();
                        foul.push(played);

                        res.push(Event::FoulGiven { from: (player_id), to: (p_id), cards: foul.clone() });

                        self.add_cards_to_player(&p_id, foul);
                        self.turn = p_id;
                        self.first = self.turn; // nice error diddy
                        // give foul as well as turn to next player , check winners and game end, no need to check exception condition as players hands gonna be full after a foul
                        let winners = self.check_winner();
                            
                        self.players.retain(|p| !winners.contains(&p.id));

                        for winner in winners {
                            res.push(Event::PlayerWon { player_id : winner });
                        }

                        if self.players.len() == 1 {
                            res.push(Event::EndGame { p_id: self.players.first().expect("last players").id });
                            self.reset();
                            return res;
                        }

                        res.push(Event::NextTurn { player_id : self.turn });
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
    pub fn mark_ready(& mut self , p_id : PlayerId) -> bool {
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

    fn check_turn(&mut self) {
        self.turn = self.turn_stack.iter().max_by_key(|(c , _)| c.rank).expect("return a valid person to receive turn").1;
    }

    fn check_winner(&mut self)-> Vec<PlayerId>{
        self.players.iter().filter(|p| p.hand.is_empty() && self.turn != p.id).map(|p| p.id).collect()
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
}
