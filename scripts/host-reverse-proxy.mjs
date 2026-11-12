#!/usr/bin/env bun
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
 * Usage: bun scripts/host-reverse-proxy.mjs <listen-port> <up-host> <up-port> [switchboard-port]
 *   e.g. bun scripts/host-reverse-proxy.mjs 2845 127.0.0.1 2844 7844
 *
 * With a switchboard port, paths the Switchboard owns (`/graphql`,
 * `/attachments`) go to it instead of the studio: Connect resolves its
 * remote switchboard against the browser's own origin, so a proxied host
 * must answer `/graphql` too, or every remote query dies as
 * "switchboard-remote: Failed to fetch".
 */

const [listenPortRaw, upHost = "127.0.0.1", upPortRaw, switchPortRaw] =
  process.argv.slice(2);
const listenPort = Number(listenPortRaw ?? 2845);
const upPort = Number(upPortRaw ?? 2844);
const switchPort = Number(switchPortRaw ?? 0);
if (!Number.isInteger(listenPort) || !Number.isInteger(upPort)) {
  console.error(
    "usage: bun scripts/host-reverse-proxy.mjs <listen-port> <up-host> <up-port> [switchboard-port]",
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
/** Hop-by-hop headers that must not cross a proxy (RFC 9110 §7.6.1). */
const HOP_BY_HOP = [
  "connection",
  "keep-alive",
  "proxy-connection",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
];

Bun.serve({
  port: listenPort,
  hostname: "127.0.0.1",
  async fetch(req, srv) {
    const url = new URL(req.url);
    if (
      url.searchParams.get("token") !== null &&
      srv.upgrade(req, {
        data: { path: url.pathname + url.search, headers: req.headers },
      })
    ) {
      return undefined; // upgraded; frames relayed by the websocket handlers
    }
    const headers = new Headers(req.headers);
    const route = routeFor(url.pathname, req.headers.get("accept"));
    headers.set("host", route.host);
    for (const h of HOP_BY_HOP) headers.delete(h);
    const body = req.method !== "GET" && req.method !== "HEAD" ? req.body : undefined;
    try {
      const res = await fetch(
        `http://${upHost}:${route.port}` + url.pathname + url.search,
        {
        method: req.method,
        headers,
        body,
        ...(body ? { duplex: "half" } : {}),
        redirect: "manual",
      });
      const out = new Headers(res.headers);
      for (const h of HOP_BY_HOP) out.delete(h);
      if (
        SWITCHBOARD_ORIGINS.length > 0 &&
        res.status === 200 &&
        url.pathname === "/powerhouse.config.json"
      ) {
        // The studio names the switchboard by its literal loopback URL;
        // hand the browser the placeholder instead so its queries aim at
        // this page's origin (here), which this proxy then answers.
        let text = await res.text();
        for (const origin of SWITCHBOARD_ORIGINS) {
          text = text.split(origin).join("${origin}");
        }
        out.delete("content-length");
        out.delete("content-encoding");
        return new Response(text, { status: res.status, headers: out });
      }
      return new Response(res.body, { status: res.status, headers: out });
    } catch {
      return new Response("upstream unavailable", { status: 502 });
    }
  },
  websocket: {
    /** @param {WebSocket & { data: { path: string; headers: Headers } }} client */
    open(client) {
      const { path, headers } = client.data;
      const route = routeFor(path.split("?")[0], headers.get("accept"));
      /** @type {string[]} */
      const lines = [`GET ${path} HTTP/1.1`, `Host: ${route.host}`];
      headers.forEach((value, key) => {
        if (!HOP_BY_HOP.includes(key.toLowerCase()) && key.toLowerCase() !== "host") {
          lines.push(`${key}: ${value}`);
        }
      });
      const handshake = Buffer.from(`${lines.join("\r\n")}\r\n\r\n`, "latin1");
      /** @type {{ head: Buffer, conn: ReturnType<typeof Bun.connect> | null, pending: Buffer | null }} */
      const state = { head: Buffer.alloc(0), conn: null, pending: null };
      const conn = Bun.connect({
        hostname: upHost,
        port: route.port,
        socket: {
          open(socket) {
            socket.write(handshake);
          },
          data(_socket, bytes) {
            if (!state.conn) {
              state.head = Buffer.concat([state.head, Buffer.from(bytes)]);
              const head = state.head.toString("latin1");
              if (!head.includes("\r\n\r\n")) return;
              if (!/^HTTP\/1\.1 101/.test(head)) {
                client.close(1002, "upstream refused upgrade");
                _socket.data = undefined; // no-op field init
                _socket.end();
                return;
              }
              state.conn = _socket;
              _socket.data = state;
              if (state.pending) {
                _socket.write(state.pending);
                state.pending = null;
              }
              const rest = state.head.subarray(
                head.indexOf("\r\n\r\n") + 4,
              );
              if (rest.length > 0) client.send(rest);
            } else {
              client.send(Buffer.from(bytes));
            }
          },
          close() {
            try {
              client.close();
            } catch {
              /* already closed */
            }
          },
          error() {
            try {
              client.close(1011, "upstream error");
            } catch {
              /* already closed */
            }
          },
        },
      });
      // Attach the state immediately: `message` may run before the first
      // upstream read assigns it, and reading `conn.data` as undefined
      // crashed the whole proxy (uncaught TypeError in the ws handler).
      conn.data = state;
      client.data = { ...client.data, conn };
    },
    /** @param {WebSocket & { data: { conn?: ReturnType<typeof Bun.connect> | null } }} client */
    message(client, message) {
      const conn = client.data.conn;
      const state = conn?.data;
      if (conn && state && state.conn) {
        conn.write(typeof message === "string" ? Buffer.from(message) : message);
      } else if (conn) {
        const chunk = typeof message === "string" ? Buffer.from(message) : Buffer.from(message);
        conn.data = { ...state, pending: state.pending ? Buffer.concat([state.pending, chunk]) : chunk };
      }
    },
    /** @param {WebSocket & { data: { conn?: { end(): void } } }} client */
    close(client) {
      try {
        client.data.conn?.end();
      } catch {
        /* already gone */
      }
    },
  },
});

console.log(
  `host-reverse-proxy listening on http://127.0.0.1:${listenPort} -> ${UPSTREAM} (Host rewritten to ${REWRITE_HOST})` +
    (switchPort > 0
      ? `, ${SWITCHBOARD_PATHS.join(", ")} -> http://${upHost}:${switchPort}`
      : ""),
);
