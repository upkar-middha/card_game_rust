use std::sync::Arc;
use tokio::sync::{RwLock, broadcast};
use axum::{Router, response::Html, routing::get};
use tower_http::services::ServeDir;
use crate::network::web_socket_handler::{AppState, ws_handler};
use crate::game::logic::Game;

// use super::ws::ws_handler;


pub fn build_router(game : Arc<RwLock<Game>>) -> Router {
    let (tx , _) = broadcast::channel(1024);
    
    let state = AppState{
        game,
        tx,
    };
    Router::new()

    .route("/", get(index))
    .route("/ws" , get(ws_handler))
    .nest_service(
            "/assets",
            ServeDir::new("src/game_assets/assets"),
    )
    .with_state(state)
}

async fn index() -> Html<&'static str> {
    Html(include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/src/game_assets/index.html"
    )))
}

