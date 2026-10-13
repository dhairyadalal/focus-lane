import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

const root = new URL("../src/shared/", import.meta.url);
const files = new Map([
  ["/", ["sidepanel.html", "text/html; charset=utf-8"]],
  ["/sidepanel.html", ["sidepanel.html", "text/html; charset=utf-8"]],
  ["/sidepanel.js", ["sidepanel.js", "text/javascript; charset=utf-8"]],
  ["/extension-api.js", ["extension-api.js", "text/javascript; charset=utf-8"]],
  ["/task-seed.js", ["task-seed.js", "text/javascript; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]]
]);
const port = Number(process.env.PORT || 4173);

createServer(async (request, response) => {
  const path = new URL(request.url, `http://${request.headers.host}`).pathname;
  const entry = files.get(path);
  if (!entry) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }
  try {
    const body = await readFile(new URL(entry[0], root));
    response.writeHead(200, { "content-type": entry[1], "cache-control": "no-store" });
    response.end(body);
  } catch {
    response.writeHead(500);
    response.end("Unable to load demo file");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Focus Lane demo: http://127.0.0.1:${port}/`);
});
