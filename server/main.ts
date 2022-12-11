

import express from 'express';
import http from 'http';
import WebSocket from 'ws';
import * as nodePty from 'node-pty'

const app = express();
const server = new http.Server(app);

let staticDir = 'dist/client'
if (process.env.NODE_ENV === "development") {
  staticDir = ".cache/dist/client";
}

app.use("/", express.static(staticDir));
const wss = new WebSocket.Server({ server });

wss.on("connection", (ws) => {
  let pty = nodePty.spawn("bash", ["--login"], {
    name: "xterm-color",
    cols: 80,
    rows: 24,
    cwd: process.env.HOME as string,
    // env: process.env,
  });
  pty.onData((data) => {
    // console.log("send: %s", data);
    ws.send(JSON.stringify({ output: data }));
  });
  ws.on("message", (message) => {
    console.log("received: %s", message);
    const m = JSON.parse(message.toString());

    if (m.input) {
      pty.write(m.input);
    } else if (m.resize) {
      pty.resize(m.resize[0], m.resize[1]);
    }
  });
});

server.listen(process.env.PORT || 8999, () => {
  console.log(`Server started on ${JSON.stringify(server.address())} :)`);
});

