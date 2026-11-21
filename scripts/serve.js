import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";

const PORT = Number(process.env.PORT ?? 4173);
const HOST = process.env.HOST ?? "127.0.0.1";
const ROOT = process.cwd();
const ALLOWED = ["ui", "src", "manual"];
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  let path = decodeURIComponent(url.pathname);
  if (path === "/" || path === "/index.html") path = "/ui/index.html";

  const rel = normalize(path).replace(/^[\\/]+/, "");
  const top = rel.split(sep)[0].split("/")[0];
  if (!ALLOWED.includes(top) || rel.includes("..")) {
    res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
    return;
  }
  try {
    const body = await readFile(join(ROOT, rel));
    res.writeHead(200, {
      "content-type": TYPES[extname(rel)] ?? "application/octet-stream",
      "cache-control": "no-store",
    }).end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Rewards settlement test bench: http://localhost:${PORT}`);
  console.log(`Buggy build: http://localhost:${PORT}/?impl=buggy`);
});
