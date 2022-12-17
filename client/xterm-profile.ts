import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { SearchAddon } from "xterm-addon-search";
import { SerializeAddon } from "xterm-addon-serialize";
import { Unicode11Addon } from "xterm-addon-unicode11";
import { WebLinksAddon } from "xterm-addon-web-links";

const term = new Terminal({
  cols: 80,
  rows: 24,
  allowProposedApi: true,
});
term.open(document.getElementById("terminal") as HTMLInputElement);

// addons
const fitAddon = new FitAddon();
// const ligaturesAddon = new LigaturesAddon();
const searchAddon = new SearchAddon();
const webLinksAddon = new WebLinksAddon();
const unicode11Addon = new Unicode11Addon();
const serializeAddon = new SerializeAddon();

[
  fitAddon,
  // ligaturesAddon,
  searchAddon,
  webLinksAddon,
  unicode11Addon,
  serializeAddon,
].map((e) => term.loadAddon(e));

// term.unicode.activeVersion = '11';

const ws = new WebSocket(`ws://${location.hostname}:8999`);

ws.addEventListener("open", () => {
  console.info("WebSocket connected");
});
ws.addEventListener("message", (event) => {
  console.debug("Message from server ", event.data);
  try {
    let output = JSON.parse(event.data);
    term.write(output.output, () => {
      // console.log(serializeAddon.serialize());
    });
  } catch (e) {
    console.error(e);
  }
});

term.onData((data) => ws.send(JSON.stringify({ input: data })));

window.addEventListener("resize", () => {
  fitAddon.fit();
});

fitAddon.fit();

term.onResize((size) => {
  console.debug("resize");
  const resizer = JSON.stringify({ resizer: [size.cols, size.rows] });
  ws.send(resizer);
});
