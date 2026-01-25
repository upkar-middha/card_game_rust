use crate::game::event::PrivateMsg;
use crate::game::event::Event;
pub enum OutgoingMsg {
    Public(Event),
    Private(PrivateMsg),
}