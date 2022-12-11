// const { Terminal } = require("xterm");

const term = new Terminal({
  cols: 80,
  rows: 24,
  allowProposedApi: true,
});
term.open(document.getElementById("terminal"));

// addons
const fitAddon = new FitAddon.FitAddon();
// const ligaturesAddon = new LigaturesAddon.LigaturesAddon();
const searchAddon = new SearchAddon.SearchAddon(); 
const webLinksAddon = new WebLinksAddon.WebLinksAddon(); 
const unicode11Addon = new Unicode11Addon.Unicode11Addon(); 
const serializeAddon = new SerializeAddon.SerializeAddon(); 

[
  fitAddon,
  // ligaturesAddon,
  searchAddon,
  webLinksAddon,
  unicode11Addon,
  serializeAddon,
].map((e) => term.loadAddon(e));

term.unicode.activeVersion = '11';

const ws = new WebSocket(`ws://${location.hostname}:8999`);

ws.addEventListener("open", function () {
  console.info("WebSocket connected");
});
ws.addEventListener("message", function (event) {
  console.debug("Message from server ", event.data);
  try {
    let output = JSON.parse(event.data);
    term.write(output.output, () => {
      console.log(serializeAddon.serialize());
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
