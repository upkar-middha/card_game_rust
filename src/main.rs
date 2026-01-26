use crate::{game::logic:: Game, network::game_route::build_router};
use std::sync::Arc;
use tokio::sync::RwLock;
use crate::network::server::Server;
// mark ready should contain name , and i should send seat as well as name along it , far better
mod network;
mod game;
#[tokio::main]
async fn main() {
    let game = Arc::new(RwLock::new(Game::new()));
    let app = build_router(game);
    let addr = "0.0.0.0:3000";

    println!("🚀 Server running at http://0.0.0.0:3000");

    let s = Server::new(addr).await;
    s.run(app).await;
}




