const WS_URL = "ws://127.0.0.1:3000/ws";

// Give each test client a name so logs are readable
const CLIENT_NAME = global.CLIENT_NAME ?? "player";

const ws = new WebSocket(WS_URL);

ws.onopen = () => {
  console.log(`[${CLIENT_NAME}] connected`);
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  console.log(
    `[${CLIENT_NAME}] ←\n`,
    JSON.stringify(msg, null, 2)
  );
};


ws.onclose = () => {
  console.log(`[${CLIENT_NAME}] disconnected`);
};

ws.onerror = (err) => {
  console.error(`[${CLIENT_NAME}] error`, err);
};

// helper so you can type commands in Node REPL later
global.send = (obj) => {
  ws.send(JSON.stringify(obj));
  console.log(`[${CLIENT_NAME}] →`, obj);
};