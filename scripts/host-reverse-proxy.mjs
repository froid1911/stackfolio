#!/usr/bin/env node
/**
 * Host-rewriting reverse proxy for Vite's dev-server host guard.
 *
 * Vite (8.x) rejects Host headers that are neither localhost nor an IP
 * (`server.allowedHosts`; not configurable here because ph-cli builds the
 * studio dev server with `configFile: false`). `tailscale serve` forwards
 * the original `Host: flank.tail45cd22.ts.net`, so the app would 403.
 * Vite's own host check allows any IP, so this proxy forwards everything
 * to the studio with `Host` rewritten to the upstream's literal
 * `127.0.0.1:<port>`, including WebSocket upgrades (Vite HMR).
 *
 * Usage: node scripts/host-reverse-proxy.mjs <listen-port> <up-host> <up-port> [switchboard-port]
 *   e.g. node scripts/host-reverse-proxy.mjs 2845 127.0.0.1 2844 7844
 *
 * With a switchboard port, paths the Switchboard owns (`/graphql`,
 * `/attachments`) go to it instead of the studio: Connect resolves its
 * remote switchboard against the browser's own origin, so a proxied host
 * must answer `/graphql` too, or every remote query dies as
 * "switchboard-remote: Failed to fetch".
 *
 * Engine: pure Node (node:http, node:net). Bun's runtime was tried first
 * and failed twice over: `Bun.serve`'s websocket bridge silently drops
 * frames in both directions (raw `Bun.connect` clients never reach an
 * upgraded server and vice versa), and bun-compiled long-lived servers
 * died within minutes. Vite HMR needs a relay that just forwards bytes.
 */

import { createServer } from "node:http";
import { connect } from "node:net";

const [listenPortRaw, upHost = "127.0.0.1", upPortRaw, switchPortRaw] =
  process.argv.slice(2);
const listenPort = Number(listenPortRaw ?? 2845);
const upPort = Number(upPortRaw ?? 2844);
const switchPort = Number(switchPortRaw ?? 0);
if (!Number.isInteger(listenPort) || !Number.isInteger(upPort)) {
  console.error(
    "usage: node scripts/host-reverse-proxy.mjs <listen-port> <up-host> <up-port> [switchboard-port]",
  );
  process.exit(2);
}

/** Path prefixes the Switchboard answers, not the studio (mirrors
 * SWITCHBOARD_PROXY_PATHS in @powerhousedao/shared/connect). */
const SWITCHBOARD_PATHS = ["/graphql", "/attachments", "/mcp", "/api/"];
/** `/d/<drive>` is a Switchboard endpoint and a Connect route at once: a
 * browser navigation (Accept: text/html) belongs to the SPA, everything
 * else (fetch, websockets) to the Switchboard. */
const isHtmlNavigation = (accept) =>
  typeof accept === "string" && accept.includes("text/html");
function routeFor(pathname, accept) {
  if (switchPort <= 0) return { port: upPort, host: REWRITE_HOST };
  if (pathname === "/d" || pathname.startsWith("/d/")) {
    return isHtmlNavigation(accept)
      ? { port: upPort, host: REWRITE_HOST }
      : { port: switchPort, host: `${upHost}:${switchPort}` };
  }
  if (
    SWITCHBOARD_PATHS.some((p) => pathname === p || pathname.startsWith(p))
  ) {
    return { port: switchPort, host: `${upHost}:${switchPort}` };
  }
  return { port: upPort, host: REWRITE_HOST };
}

/** The Switchboard origin the served config bakes into defaultDrives when
 * it skips the `${origin}` placeholder; rewritten back to the placeholder
 * so the browser substitutes the page's own origin. */
const SWITCHBOARD_ORIGINS =
  switchPort > 0
    ? [`http://localhost:${switchPort}`, `http://${upHost}:${switchPort}`]
    : [];

const UPSTREAM = `http://${upHost}:${upPort}`;
const REWRITE_HOST = `${upHost}:${upPort}`;
/** Hop-by-hop headers that must not cross a proxy (RFC 9110 §7.6.1).
 * `connection`/`upgrade` are excluded on the WS path below: the upgrade
 * handshake must forward them verbatim to trigger Vite's own upgrade. */
const HOP_BY_HOP = [
  "connection",
  "keep-alive",
  "proxy-connection",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
];

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
  const route = routeFor(url.pathname, req.headers.accept);
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (v === undefined) continue;
    const kl = k.toLowerCase();
    if (HOP_BY_HOP.includes(kl) || kl === "host") continue;
    headers[k] = v;
  }
  headers.host = route.host;
  try {
    const upstreamRes = await fetch(
      `http://${upHost}:${route.port}${url.pathname}${url.search}`,
      {
        method: req.method,
        headers,
        ...(req.method !== "GET" && req.method !== "HEAD"
          ? { body: req, duplex: "half" }
          : {}),
        redirect: "manual",
      },
    );
    const outHeaders = {};
    upstreamRes.headers.forEach((v, k) => {
      if (!HOP_BY_HOP.includes(k.toLowerCase())) outHeaders[k] = v;
    });
    const body = Buffer.from(await upstreamRes.arrayBuffer());
    if (
      SWITCHBOARD_ORIGINS.length > 0 &&
      upstreamRes.status === 200 &&
      url.pathname === "/powerhouse.config.json"
    ) {
      // The studio names the switchboard by its literal loopback URL;
      // hand the browser the placeholder instead so its queries aim at
      // this page's origin (here), which this proxy then answers.
      let text = body.toString("utf8");
      for (const origin of SWITCHBOARD_ORIGINS) {
        text = text.split(origin).join("${origin}");
      }
      const replaced = Buffer.from(text, "utf8");
      delete outHeaders["content-length"];
      delete outHeaders["content-encoding"];
      res.writeHead(upstreamRes.status, outHeaders);
      res.end(replaced);
      return;
    }
    res.writeHead(upstreamRes.status, outHeaders);
    res.end(body);
  } catch {
    res.writeHead(502, { "content-type": "text/plain" });
    res.end("upstream unavailable");
  }
});

/**
 * WebSocket bridge: raw bytes between the browser socket and a plain TCP
 * connection to the routed upstream. Node's http server hands the
 * upgrade request over before writing any response, so the upstream's
 * real 101 (Vite's own, token check included) flows back verbatim. The
 * re-issued handshake carries the Host Vite allows. Bytes the client
 * sends before the 101 is parsed are held and flushed on 101.
 */
server.on("upgrade", (req, client, head) => {
  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
  const route = routeFor(url.pathname, req.headers.accept);
  const lines = [
    `GET ${url.pathname}${url.search} HTTP/1.1`,
    `Host: ${route.host}`,
  ];
  for (const [k, v] of Object.entries(req.headers)) {
    if (v === undefined) continue;
    const kl = k.toLowerCase();
    if (HOP_BY_HOP.includes(kl) && kl !== "connection" && kl !== "upgrade")
      continue;
    if (kl === "host") continue;
    lines.push(`${k}: ${v}`);
  }
  const handshake = Buffer.from(`${lines.join("\r\n")}\r\n\r\n`, "latin1");

  const up = connect(route.port, upHost);
  let ready = false;
  const held = [];
  let headBuf = Buffer.alloc(0);

  up.on("connect", () => up.write(handshake));
  up.on("data", (b) => {
    if (!ready) {
      headBuf = Buffer.concat([headBuf, b]);
      const text = headBuf.toString("latin1");
      const sep = text.indexOf("\r\n\r\n");
      if (sep < 0) return;
      if (!/^HTTP\/1\.1 101/.test(text)) {
        // The upstream rejected the upgrade: pass its verdict through.
        client.write(headBuf.subarray(0, sep + 4));
        client.destroy();
        up.destroy();
        return;
      }
      ready = true;
      client.write(headBuf.subarray(0, sep + 4));
      const rest = headBuf.subarray(sep + 4);
      if (rest.length) client.write(rest);
      while (held.length) up.write(held.shift());
      return;
    }
    client.write(b);
  });
  client.on("data", (c) => {
    if (ready) up.write(Buffer.from(c));
    else held.push(Buffer.from(c));
  });
  client.on("close", () => up.destroy());
  client.on("error", () => up.destroy());
  up.on("close", () => client.destroy());
  up.on("error", () => client.destroy());
  if (head && head.length) held.push(Buffer.from(head));
});

server.listen(listenPort, "127.0.0.1", () => {
  console.log(
    `host-reverse-proxy listening on http://127.0.0.1:${listenPort} -> ${UPSTREAM} (Host rewritten to ${REWRITE_HOST})` +
      (switchPort > 0
        ? `, ${SWITCHBOARD_PATHS.join(", ")} -> http://${upHost}:${switchPort}`
        : ""),
  );
});
