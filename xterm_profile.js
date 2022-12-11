const fitAddon = new FitAddon.FitAddon();
const term = new Terminal({
  cols: 80,
  rows: 24,
});
term.loadAddon(fitAddon);

const ws = new WebSocket(`ws://${location.hostname}:8999`);

ws.addEventListener("open", function () {
  console.info("WebSocket connected");
});
ws.addEventListener("message", function (event) {
  console.debug("Message from server ", event.data);
  try {
    let output = JSON.parse(event.data);
    term.write(output.output);
  } catch (e) {
    console.error(e);
  }
});

term.open(document.getElementById("terminal"));

term.onData((data) => ws.send(JSON.stringify({ input: data })));

window.addEventListener("resize", () => {
  fitAddon.fit();
});

fitAddon.fit();

term.onResize((size) => {
  console.debug("resize");
  let resizer = JSON.stringify({ resizer: [size.cols, size.rows] });
  ws.send(resizer);
});
