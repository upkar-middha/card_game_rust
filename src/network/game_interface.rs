use std::collections::HashMap;
use rand::Rng;
use tokio::sync::mpsc;
use crate::game::event::ServerMessage;
use crate::game::players::PlayerId;
use crate::network::room::Room;
use crate::network::room::RoomHandle;
use crate::network::room::RoomMessage;

/*
 DEAD ROOMS ARE LEAKING , NEED A BACK COMMUNICATION CHANNEL FROM ROOMS TO INTERFACE ;; create enum InterfaceMsg to do it, room
 will store a sender to interface
  fuck it..., good enough early model , no need to over-optimize early on....
   */

/* The game interface is from where player communicates initially
 1. A player can ask to create a room , The interface will give a room_id for other players to join and also a room receiver
 2. A player can request to join a room by giving a room_id , interface will verify room_id and will give a room receiver*/

 /*
 This interface owns player and room_ids , player ids to give to connecting players , and room_ids if player wants to make rooms
 it also owns a map of room_id to a handle , because Connection -> Interface -> Room -> Game
 after a connection gets its room handle to push Room messages into a single threaded self synchronised queue , it executes them
 sequentaily 
  */

  // Player meta data like name which room is assigned , any room created might be needed to prevent spoofing in future.
pub struct GameInterface {

    // used_player_ids : HashSet<PlayerId>,
    free_player_ids : Vec<PlayerId>,
    room_id_to_room_receiver : HashMap<u32 , RoomHandle>, // interface to room
    free_room_ids : Vec<u32>,
    id_to_name : HashMap<PlayerId , String>,
    // tx : mpsc::Sender<InterfaceRequests>,
    rx : mpsc::Receiver<InterfaceRequests>, // websocket to interface
    id_to_ws_tx : HashMap<PlayerId , mpsc::Sender<WsResponse>>,
    // i need a interface to websocket****


}
pub fn randomise(r_ids :&mut Vec<u32>) {
    let mut rng = rand::rng();
    let n = r_ids.len();

    for i in 0..n {
        let j = rng.random_range(0..n);
        r_ids.swap(i , j);
    }
}
impl GameInterface {
    pub fn new() -> (Self,mpsc::Sender<InterfaceRequests>) {
        let mut free_player_ids:Vec<PlayerId> = Vec::new();
        let mut start: u32 = 1;

        while start < 100000 {
            free_player_ids.push(PlayerId(start));
            start += 1;
        }

        start = 100000;

        let mut free_room_ids : Vec<u32> = Vec::new();

        while start < 1000000 {
            free_room_ids.push(start);
            start += 1;
        }
        let (tx , rx) = mpsc::channel(100);
        randomise(&mut free_room_ids);

       return  (Self {
            // used_player_ids:HashSet::new(),
            free_player_ids,
            room_id_to_room_receiver:HashMap::new(),
            free_room_ids,
            id_to_name : HashMap::new(),
            rx, //interface recv from here and execute in its run
            id_to_ws_tx : HashMap::new(),
        } , tx.clone()); // other send to interface through this 

    }

    pub async fn run(&mut self) {

        while let Some(msg) = self.rx.recv().await {

            match msg {
                InterfaceRequests::Connect {
                    ws_tx, // websocket opening channel to interface
                    tx
                } => {
                    let id = self.new_player().expect("i begged the interface to bless me");
                    self.id_to_ws_tx.insert(id, ws_tx.clone());
                    // println!("sending runtime connected");
                    let _ = ws_tx.send(WsResponse::Connected { player_id: id }).await; // GPT...
                    // println!("runtime connected sent");
                    let _ = tx.send(ServerMessage::Connected {p_id: id});
                }

                InterfaceRequests::SetName { 
                    p_id,
                    name,
                    tx
                } => {
                    // println!("set name inside interface req");
                    self.id_to_name.insert(p_id, name);

                    let _ = tx.send(ServerMessage::NameRegistered);
                    // println!("server message is set ");
                }

                InterfaceRequests::CreateRoom { // call create room and join room at front-end if clicked create room , but will it work , will the async conncection close as soon as i create empty room ?
                    p_id,
                    interface_tx,
                    tx
                } => {

                    if !self.id_to_name.contains_key(&p_id) {
                        let _ = tx.send(ServerMessage::Error { err : "Nameless Retards are not allowed to create room".into() });
                        continue;
                    }

                    let r_id = self.free_room_ids.pop().expect("i know free ids exist , i just can't prove it");
                    let (mut room , handle) = Room::new(r_id , interface_tx);
                    self.room_id_to_room_receiver.insert(r_id, handle);

                    tokio::spawn(async move {
                        room.run().await;
                        }
                    ); 

                    let _ = tx.send(ServerMessage::RoomCreated { r_id });
                    // self send join message to handle join spoofing from client side , for now just focus on client side join
                }

                InterfaceRequests::JoinRoom { 
                    p_id,
                    r_id,
                    tx
                } => {

                    if !self.id_to_name.contains_key(&p_id) {
                        let _ = tx.send(ServerMessage::Error { err : "Nameless Retards are not allowed to join room".into() });
                        continue;
                    }

                    if !self.room_id_to_room_receiver.contains_key(&r_id) {
                        let _ = tx.send(ServerMessage::Error { err: "Room does not exist".into() });
                        continue;
                    }
                    

                    let handle = self.room_id_to_room_receiver[&r_id].clone();
                    let _ = handle.tx.send(RoomMessage::JoinPlayer { p_id, name: self.id_to_name.get(&p_id).expect("Name exists").clone(), tx}).await;
                    // interface_tx.send(WsResponse::Handle(handle)); // can i make this wait ?


                    //if phase is GamePhase::Playing , send Error again saying game in progress
                    //else i will write code as follows
                    // send RoomMessage JoinRoom to room handle
                }
                // change , player can leave room just from a client side action , cuz connection has its room handle , send to room that this guy leaving
                InterfaceRequests::LeaveRoom { 
                    p_id, 
                    r_id,
                    tx,
                } => {
                    // this message is sent by either disconnect from websocket or by player
                    // should room send disconnects to interface or interface tells rooms to disconnect , do Interface to room for now
                    if !self.room_id_to_room_receiver.contains_key(&r_id) {
                        let _ = tx.send(ServerMessage::Error { err: "Ha Ha smartyy , get off".into() });
                        continue;
                    }
                    let handle  = self.room_id_to_room_receiver.get(&r_id).expect("map check handled").clone();

                    let _ = handle.tx.send(RoomMessage::LeavePlayer { p_id }).await;
                    let ws_tx = self.id_to_ws_tx.get(&p_id).expect("connection to socket exists for live players");
                    let _ = ws_tx.send(WsResponse::RemoveHandle).await;

                }

                InterfaceRequests::RoomClose {
                    r_id
                } => {
                    self.room_id_to_room_receiver.remove(&r_id);
                    self.free_room_ids.push(r_id);
                }

                InterfaceRequests::Disconnect {
                    p_id
                } => {
                    self.id_to_name.remove(&p_id);
                    self.free_player_ids.push(p_id);
                    self.id_to_ws_tx.remove(&p_id);
                    
                }

                // InterfaceRequests::GiveRoomHandle { 
                //     r_id,
                //     ws_tx
                // } => {
                //     let handle = self.room_id_to_room_receiver.get(&r_id).expect("Already checked that room exists");
                //     let _ = ws_tx.send(WsResponse::Handle(handle.clone()));
                // }

                InterfaceRequests::GameStarted { 
                    tx
                } => {
                    let _ = tx.send(ServerMessage::Error{ err: "Your friends have already started the game".into()});
                }

                InterfaceRequests::RoomIsFull { 
                    tx
                } => {
                    // let tx = self.id_to_tx.get(&p_id).expect("id always exists").clone();
                    let _ = tx.send(ServerMessage::Error{ err: "Everyone has a place in this world and yours is not in this room".into()});
                }

                InterfaceRequests::RoomJoinSuccess {
                    p_id,
                    r_id,
                    tx
                } => {
                    let ws_tx = self.id_to_ws_tx.get(&p_id).expect("id always exists").clone();
                    let handle = self.room_id_to_room_receiver.get(&r_id).expect("Room exist").clone();
                    let _ = tx.send(ServerMessage::RoomJoined { r_id });
                    let _ = ws_tx.send(WsResponse::Handle(handle.clone())).await;
                }

            }
        }
    }

    fn new_player(&mut self) -> Option<PlayerId> {
        self.free_player_ids.pop()
    }

    // pub async fn create_room(&mut self,p_id: PlayerId , tx:UnboundedSender<ServerMessage> , name : String) -> Option<u32> {

    //     let r_id = self.free_room_ids.pop()?;

    //     let mut room = Room::new(r_id); // it should not give a handle , rather join room used just below in this function should give handle to maintain correctness

    //     self.room_id_to_room_receiver
    //         .insert(r_id, handle.clone());

    //     tokio::spawn(async move {
    //         room.run().await;
    //         }
    //     );

    //     // handle.tx.send(
    //     //     room::RoomMessage::JoinPlayer { p_id : p_id }
    //     // );
    //     let _ = self.join_room(r_id , p_id , tx , name).await;

    //     Some((r_id, handle))
    // }

    // remove double get operations (in map) in join room by using if let
    // pub async fn join_room(&mut self , room_id : u32 , p_id : PlayerId , tx : UnboundedSender<ServerMessage> , name : String) -> Option<RoomHandle> {
    //     if self.room_id_to_room_receiver.contains_key(&room_id) {

    //         let handle = self.room_id_to_room_receiver.get(&room_id).unwrap();
    //         let _ = handle.tx.send(RoomMessage::JoinPlayer { p_id, name , tx }).await;
    //         // if you receive gameinprogress or room full event , send none
    //         return Some(handle.clone());
    //     }
    //     return None;
    // }

    // pub fn leave_room(p_id : PlayerId) {

    // }

 

    // pub fn disconnect_player(&mut self , p_id : PlayerId) {
    //     self.free_player_ids.push(p_id);
    // }
}

pub enum InterfaceRequests {
    Connect {tx : mpsc::UnboundedSender<ServerMessage> , ws_tx : mpsc::Sender<WsResponse>},
    SetName {p_id : PlayerId , name : String , tx : mpsc::UnboundedSender<ServerMessage>},
    CreateRoom {p_id : PlayerId , interface_tx : mpsc::Sender<InterfaceRequests> , tx : mpsc::UnboundedSender<ServerMessage>},
    JoinRoom {p_id : PlayerId , r_id : u32 , tx : mpsc::UnboundedSender<ServerMessage>},
    LeaveRoom {p_id : PlayerId , r_id : u32 , tx : mpsc::UnboundedSender<ServerMessage>},
    RoomClose {r_id : u32 },
    Disconnect {p_id : PlayerId},
    // GiveRoomHandle {r_id : u32 , ws_tx : mpsc::Sender<WsResponse>},
    RoomIsFull {tx : mpsc::UnboundedSender<ServerMessage>},
    GameStarted {tx : mpsc::UnboundedSender<ServerMessage>},
    RoomJoinSuccess {p_id : PlayerId , r_id : u32 , tx : mpsc::UnboundedSender<ServerMessage>},

}

// unserialized communication between ws and interface , used to send rust runtime messages
pub enum WsResponse {
    Connected {player_id : PlayerId},
    Handle(RoomHandle),
    RemoveHandle,
}

