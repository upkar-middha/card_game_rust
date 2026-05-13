use crate::{game::logic:: Game, network::{game_interface::{GameInterface}, game_route::build_router}};
// use std::sync::Arc;
// use tokio::sync::RwLock;
use crate::network::server::Server;
// mark ready should contain name , and i should send seat as well as name along it , far better
/* 7 may , 2026 , home sweet home
   put all number from 1`00`000 to 9`99`999 in a vector (3.5MB) and this will be room numbers 
   starting from 1 , assign each number to every connection along with name(Player class attribute)(during sign up)(add profile data base in future) , 
   update player class to have room_id as a member , Room number outlive player_id 
   add a clock in game instance , so that i can check how much time elapsed*/

mod network;
mod game;
#[tokio::main]
async fn main() {
    // let game = Arc::new(RwLock::new(Game::new()));
    // let app = build_router(game);
    // let interface = game_interface::GameInterface::new();


    let (mut interface, interface_tx) = GameInterface::new();
    // interface.run().await; // async bug

    tokio::spawn(async move {
        interface.run().await;
    });
    let app = build_router(interface_tx);
    let addr = "127.0.0.1:3000";

    println!("🚀 Server running at http://127.0.0.1:3000");

    let s = Server::new(addr).await;
    s.run(app).await;
    
}




