// @ts-check
// `ph run cli` brings up the switchboard + Connect together as one
// supervised stack (generic compound). The drive lives in the switchboard;
// Connect runs as a pure REMOTE CLIENT of it — a lone remote backend makes
// reactorClient "remote", so this Connect builds NO local reactor and never
// downloads PGlite. (Contrast desktop, where Connect takes the same drive as
// a SYNCHRONIZED remote drive — a local replica, which keeps PGlite by
// design. remote client = no local store; synchronized remote drive = local
// store.) Standalone `ph run connect` is untouched — still a local reactor.
import connect from "../connect/host.js";
import switchboardHost from "../switchboard/host.js";
import { outputs as switchboard } from "../switchboard/outputs.js";

/** The drives the switchboard reports (hosts/switchboard/outputs.js). */
const SERVED_DRIVES = /** @type {Exclude<keyof typeof switchboard.drives, "$item">[]} */ (
  Object.keys(switchboard.drives)
    .filter((key) => key !== "$item")
    .sort()
);

/** Every interface: in a container, Docker publishes the ports from outside. */
const ALL_INTERFACES = "0.0.0.0";

/** @satisfies {PHHost} */
export default {
  name: "cli",

  // run → each member starts at "run": switchboard = server, Connect = studio
  // (no build step needed).
  runner: {
    module: "@powerhousedao/host-core/runners/compound",
  },
  // No startOrder: the cli-connect member's output tokens start the
  // switchboard first (`ph run cli --explain outputs` prints the order).

  children: {
    // The switchboard host, on every interface and on Postgres.
    "cli-switchboard": {
      host: "switchboard",
      runner: { ...switchboardHost.runner, host: ALL_INTERFACES },
      reactor: {
        ...switchboardHost.reactor,
        backends: {
          main: {
            kind: "in-process",
            // Postgres at PH_SWITCHBOARD_DATABASE_URL (the image refuses to
            // start without it unless PH_ALLOW_PGLITE=1).
            storage: { kind: "postgres" },
          },
        },
      },
    },

    // Connect as a remote client (full-statement reactor override; the
    // standalone connect host's own reactor is untouched). The lone remote
    // backend selects reactorClient "remote"; the remote drives give the
    // client the Switchboard URL to proxy to.
    "cli-connect": {
      host: "connect",
      // Connect's server proxies the switchboard's paths to the member, and
      // serves the switchboard's URLs below as ${origin}: the browser talks
      // to its own origin for everything.
      runner: {
        host: ALL_INTERFACES,
        proxy: { target: switchboard.origin },
        // The connect host's plugins already include Workflow Studio over the
        // switchboard's Workflows drive; listing it again fails the build.
        plugins: [...connect.runner.plugins],
      },
      // Every URL is the switchboard member's output (what it actually
      // bound), so the compound starts it first.
      reactor: {
        // the override is a full statement: keep the connect host's protocol
        protocol: connect.reactor.protocol,
        backends: {
          // The switchboard, by the address of its powerhouse drive.
          sb: {
            kind: "remote",
            remote: {
              url: switchboard.drives.powerhouse.url,
            },
          },
        },
        // Every drive the switchboard member serves (its declared ones and
        // the ones its plugins create, workflows), by the URL it reports, in
        // key-sorted order. A list of output tokens rather than a $map over
        // the switchboard's outputs: `ph run cli build` maps the declarations
        // before any output exists, and fails on a $map.
        drives: SERVED_DRIVES.map((slug) => ({
          slug,
          remote: { url: switchboard.drives[slug].url },
        })),
      },
    },
  },
};
