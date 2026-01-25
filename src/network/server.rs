use axum::Router;
use tokio::net::TcpListener;
use tokio::signal;
pub struct Server{
    listener : TcpListener,

}

impl Server {
    pub async fn new(addr: impl AsRef<str>) -> Self {
        let listener = TcpListener::bind(addr.as_ref())
            .await
            .expect("failed to bind address");

        Self { listener }
    }

    pub async fn run(self , app : Router) {
        axum::serve(self.listener , app).with_graceful_shutdown(shutdown_signal()).await.expect("Server failed");
    }
}

pub async fn shutdown_signal() {
    // Ctrl+C
    signal::ctrl_c()
        .await
        .expect("failed to install Ctrl+C handler");

    println!("Shutdown signal received");
}

//to do handle broadcast to newly connected client , seat broadcast