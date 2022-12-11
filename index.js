const express = require("express");
const app = express();
const server = require("http").Server(app);
const nodePty = require("node-pty");
const WebSocket = require("ws");

app.use("/", express.static("."));
const wss = new WebSocket.Server({ server });

wss.on("connection", (ws) => {
  // ws.send('Hi there, I am a WebSocket server')
  let pty = nodePty.spawn("bash", ["--login"], {
    name: "xterm-color",
    cols: 80,
    rows: 24,
    cwd: process.env.HOME,
    env: process.env,
  });
  pty.onData((data) => {
    // console.log("send: %s", data);
    ws.send(JSON.stringify({ output: data }));
  });
  ws.on("message", (message) => {
    console.log("received: %s", message);
    m = JSON.parse(message);

    if (m.input) {
      pty.write(m.input);
    } else if (m.resize) {
      pty.resize(m.resize[0], m.resize[1]);
    }
  });
});

server.listen(process.env.PORT || 8999, () => {
  console.log(`Server started on port ${server.address().port} :)`);
});
