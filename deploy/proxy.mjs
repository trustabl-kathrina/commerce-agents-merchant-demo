// Basic-auth reverse proxy for the ACME merchant portal demo.
//
// One public port fronts two loopback processes: the FastAPI retail API (/api/*, /products/*)
// and the Next.js portal (everything else). Auth is checked here rather than in Next middleware
// so the credentials stay runtime environment variables and never reach the client bundle.

import http from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";

const PUBLIC_PORT = Number(process.env.PORT || 8000);
const WEB = { host: "127.0.0.1", port: Number(process.env.WEB_PORT || 3100) };
const API = { host: "127.0.0.1", port: Number(process.env.API_PORT || 8100) };
const API_PREFIXES = ["/api/", "/products/"];
const REALM = process.env.BASIC_AUTH_REALM || "ACME Merchant demo";

const USER = process.env.BASIC_AUTH_USER || "";
const PASSWORD = process.env.BASIC_AUTH_PASSWORD || "";

/** Constant-time compare over digests, so neither value's length leaks. */
function matches(candidate, expected) {
  const a = createHash("sha256").update(candidate).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

function authorized(req) {
  // No credentials configured means no way to authenticate: refuse everything.
  if (!USER || !PASSWORD) return false;
  const header = req.headers.authorization || "";
  if (!header.startsWith("Basic ")) return false;
  let decoded;
  try {
    decoded = Buffer.from(header.slice(6).trim(), "base64").toString("utf8");
  } catch {
    return false;
  }
  const separator = decoded.indexOf(":");
  if (separator < 0) return false;
  // Bitwise & rather than &&: both halves are always compared, so a wrong
  // username and a wrong password take the same time.
  const user = matches(decoded.slice(0, separator), USER);
  const password = matches(decoded.slice(separator + 1), PASSWORD);
  return (user & password) === 1;
}

function targetFor(url) {
  return API_PREFIXES.some((prefix) => url.startsWith(prefix)) ? API : WEB;
}

function proxy(req, res) {
  const target = targetFor(req.url);
  const upstream = http.request(
    {
      host: target.host,
      port: target.port,
      method: req.method,
      path: req.url,
      headers: { ...req.headers, host: `${target.host}:${target.port}` },
    },
    (response) => {
      // Headers pass through unchanged and the body is piped, so text/event-stream
      // chat turns reach the browser token by token.
      res.writeHead(response.statusCode || 502, response.headers);
      response.pipe(res);
    },
  );
  upstream.on("error", (error) => {
    if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain" });
    res.end(`upstream unavailable: ${error.code || error.message}\n`);
  });
  res.on("close", () => upstream.destroy());
  req.pipe(upstream);
}

const server = http.createServer((req, res) => {
  // Unauthenticated so the platform health check does not need credentials.
  if (req.url === "/healthz") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok\n");
    return;
  }
  if (!authorized(req)) {
    res.writeHead(401, {
      "www-authenticate": `Basic realm="${REALM}", charset="UTF-8"`,
      "content-type": "text/plain",
      "cache-control": "no-store",
    });
    res.end("Authentication required.\n");
    return;
  }
  proxy(req, res);
});

// Chat turns hold a response open for a while; only the idle socket timeout would cut them.
server.headersTimeout = 0;
server.requestTimeout = 0;
server.on("connection", (socket) => socket.setNoDelay(true));

server.listen(PUBLIC_PORT, "0.0.0.0", () => {
  const configured = USER && PASSWORD ? "enabled" : "MISSING — every request will 401";
  console.log(`[proxy] listening on :${PUBLIC_PORT} (basic auth ${configured})`);
});
