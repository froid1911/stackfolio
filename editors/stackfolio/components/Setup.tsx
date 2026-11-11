import {
  addDocument,
  getPHStore,
  useDocumentById,
  useNodesInSelectedDrive,
  useSelectedDrive,
} from "@powerhousedao/reactor-browser";
import { generateId } from "document-model";
import { actions as connectionActions } from "@powerhousedao/workflow/document-models/connection";
import { actions as portfolioActions } from "document-models/portfolio";
import { actions as walletActions } from "document-models/wallet-account";
import { useEffect, useRef, useState } from "react";
import { createPublicClient, http } from "viem";
import { planSetup } from "../lib/setup.js";

const DEFAULT_RPC = "http://127.0.0.1:8545";
const DEFAULT_BEACON = "http://127.0.0.1:5052";

/**
 * The first-run wizard: adopt or create the drive's singletons, record who
 * the book runs for, point at an execution and beacon node, and add the
 * first address. Each step persists before the next unlocks, so leaving and
 * returning mid-way resumes where the drive actually stands.
 */
export function Setup({ onReady }: { onReady: () => void }) {
  const [drive] = useSelectedDrive();
  const nodes = useNodesInSelectedDrive() ?? [];
  const plan = planSetup(
    nodes.map((node) => ({ kind: node.kind as "file" | "folder", id: node.id })),
    (id) => {
      const node = nodes.find((candidate) => candidate.id === id);
      return node && "documentType" in node
        ? (node as { documentType?: string }).documentType
        : undefined;
    },
  );

  const [step, setStep] = useState(0);
  const [portfolioId, setPortfolioId] = useState<string | null>(
    plan.existing.portfolio,
  );
  const [registryId, setRegistryId] = useState<string | null>(
    plan.existing.registry,
  );
  const [priceBookId, setPriceBookId] = useState<string | null>(
    plan.existing.priceBook,
  );
  const [connectionId, setConnectionId] = useState<string | null>(null);

  async function createBook(name: string, grantName: string) {
    const driveId = drive.header.id;
    if (!portfolioId) {
      const created = await addDocument(driveId, "Portfolio", "stackfolio/portfolio");
      setPortfolioId(created.id);
    }
    if (!registryId) {
      const created = await addDocument(driveId, "Asset registry", "stackfolio/asset-registry");
      setRegistryId(created.id);
    }
    if (!priceBookId) {
      const created = await addDocument(driveId, "Price book", "stackfolio/price-book");
      setPriceBookId(created.id);
    }
    return { name, grantName };
  }

  async function createConnection() {
    if (!connectionId) {
      const created = await addDocument(
        drive.header.id,
        "Local ethereum",
        "powerhouse/connection",
      );
      setConnectionId(created.id);
    }
  }

  const done = () => onReady();

  return (
    <div className="ph-default-styles mx-auto max-w-2xl p-6">
      <h1 className="text-xl font-semibold">Set up Stackfolio</h1>
      <p className="text-sm text-muted-foreground">
        Step {step + 1} of 3 —{" "}
        {["the book", "the node", "the first address"][step]}
      </p>
      <ol className="mt-2 flex gap-2 text-xs">
        {["Book", "Node", "Address"].map((label, index) => (
          <li
            key={label}
            className={
              index === step
                ? "font-semibold text-foreground"
                : index < step
                  ? "text-success"
                  : "text-muted-foreground"
            }
          >
            {index < step ? `✓ ${label}` : label}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <BookStep
          portfolioId={portfolioId}
          onCreated={createBook}
          onNext={() => setStep(1)}
        />
      )}
      {step === 1 && portfolioId && (
        <NodeStep
          connectionId={connectionId}
          onCreated={() => void createConnection()}
          onConfigured={() => setStep(2)}
        />
      )}
      {step === 2 && portfolioId && (
        <AddAccountForm
          portfolioId={portfolioId}
          onDone={() =>  done()}
        />
      )}
    </div>
  );
}

function BookStep({
  portfolioId,
  onCreated,
  onNext,
}: {
  portfolioId: string | null;
  onCreated: (name: string, grantName: string) => Promise<{ name: string; grantName: string }>;
  onNext: () => void;
}) {
  const [name, setName] = useState("My crypto book");
  const [grantName, setGrantName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [book, setBook] = useState<{ id: string; name: string; grant: string } | null>(
    portfolioId ? { id: portfolioId, name: "", grant: "" } : null,
  );

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const created = await onCreated(name, grantName);
      setBook({ id: "", name: created.name, grant: created.grantName });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-3">
      <label>
        <h3>Portfolio name</h3>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        <h3>Runs for (grant name)</h3>
        <input
          value={grantName}
          placeholder="e.g. frankp"
          onChange={(e) => setGrantName(e.target.value)}
        />
      </label>
      {error && <p className="text-red-700">{error}</p>}
      {!book ? (
        <button type="button" onClick={() => void start()} disabled={busy}>
          {busy ? "Creating…" : "Create the book"}
        </button>
      ) : (
        <InitPortfolio portfolioId={book.id || ""} name={book.name} grant={book.grant} onNext={onNext} />
      )}
    </div>
  );
}

/** Writes the book's name and grant once its document has arrived. */
function InitPortfolio({
  portfolioId,
  name,
  grant,
  onNext,
}: {
  portfolioId: string;
  name: string;
  grant: string;
  onNext: () => void;
}) {
  const [document, dispatch] = useDocumentById(portfolioId);
  const ran = useRef(false);
  useEffect(() => {
    if (!document || ran.current) return;
    ran.current = true;
    dispatch([
      portfolioActions.setPortfolioDetails({ name }),
      ...(grant
        ? [
            portfolioActions.setGrant({
              id: generateId(),
              name: grant,
              grantedAt: new Date().toISOString(),
            }),
          ]
        : []),
    ]);
    onNext();
  }, [document, dispatch, name, grant, onNext]);
  return <p className="text-sm text-muted-foreground">Creating the book…</p>;
}

function NodeStep({
  connectionId,
  onCreated,
  onConfigured,
}: {
  connectionId: string | null;
  onCreated: () => void;
  onConfigured: () => void;
}) {
  const [rpc, setRpc] = useState(DEFAULT_RPC);
  const [beacon, setBeacon] = useState(DEFAULT_BEACON);
  return (
    <div className="mt-4 flex flex-col gap-3">
      <label>
        <h3>Execution node (JSON-RPC)</h3>
        <input value={rpc} onChange={(e) => setRpc(e.target.value)} />
      </label>
      <label>
        <h3>Beacon node</h3>
        <input value={beacon} onChange={(e) => setBeacon(e.target.value)} />
      </label>
      {!connectionId ? (
        <button type="button" onClick={onCreated}>
          Save the connection
        </button>
      ) : (
        <ConfigureConnection
          connectionId={connectionId}
          rpc={rpc}
          beacon={beacon}
          onConfigured={onConfigured}
        />
      )}
    </div>
  );
}

function ConfigureConnection({
  connectionId,
  rpc,
  beacon,
  onConfigured,
}: {
  connectionId: string;
  rpc: string;
  beacon: string;
  onConfigured: () => void;
}) {
  const [document, dispatch] = useDocumentById(connectionId);
  const ran = useRef(false);
  useEffect(() => {
    if (!document || ran.current) return;
    ran.current = true;
    dispatch([
      connectionActions.setConnectionName({ name: "ethereum" }),
      connectionActions.setConfigValue({ name: "rpcUrl", value: rpc }),
      connectionActions.setConfigValue({ name: "beaconUrl", value: beacon }),
      connectionActions.setConfigValue({ name: "chainId", value: 1 }),
    ]);
    onConfigured();
  }, [document, dispatch, rpc, beacon, onConfigured]);
  return <p className="text-sm text-muted-foreground">Saving the connection…</p>;
}

export function AddAccountForm({
  portfolioId,
  onDone,
}: {
  portfolioId: string;
  onDone: () => void;
}) {
  const [document, dispatch] = useDocumentById(portfolioId);
  const [drive] = useSelectedDrive();
  const [address, setAddress] = useState("");
  const [ens, setEns] = useState("");
  const [rpc, setRpc] = useState(DEFAULT_RPC);
  const [ensBusy, setEnsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** One-shot local reverse lookup: ask the node, never a third party. */
  async function lookupEns() {
    if (!ens.trim()) return;
    setEnsBusy(true);
    setError(null);
    try {
      const client = createPublicClient({ transport: http(rpc) });
      const resolved = await client.getEnsAddress({ name: ens.trim() });
      if (resolved) setAddress(resolved);
      else setError(`${ens.trim()} has no address on ${rpc}.`);
    } catch (cause) {
      // The honest fallback: keep whatever the user typed.
      setError(
        `ENS lookup failed (${cause instanceof Error ? cause.message : "unreachable"}); type the address.`,
      );
    } finally {
      setEnsBusy(false);
    }
  }

  async function add() {
    if (!document || !address) return;
    const label = ens.trim() || null;
    dispatch([
      portfolioActions.addAddress({
        id: generateId(),
        address,
        chainId: 1,
        label: label ?? undefined,
        ensName: label ?? undefined,
        timestamp: new Date().toISOString(),
      }),
    ]);
    const created = await addDocument(
      drive.header.id,
      label ?? `${address.slice(0, 6)}…${address.slice(-4)}`,
      "stackfolio/wallet-account",
    );
    const details = walletActions.setAccountDetails({
      address,
      chainId: 1,
      label: label ?? undefined,
    });
    // The wallet document arrives through the store; bind on first sight.
    await bindWallet(created.id, details);
    onDone();
  }

  async function bindWallet(walletId: string, action: unknown) {
    const client = getPHStore()?.reactorClient;
    if (!client) throw new Error("The reactor is not ready");
    await client.write.execute(walletId, "main", [action as never]);
  }

  return (
    <div className="mt-4 flex flex-col gap-3">
      <label>
        <h3>ENS name (looked up on your node)</h3>
        <div className="flex gap-2">
          <input value={ens} onChange={(e) => setEns(e.target.value)} placeholder="vitalik.eth" />
          <button type="button" onClick={() => void lookupEns()} disabled={ensBusy}>
            {ensBusy ? "Looking up…" : "Resolve"}
          </button>
        </div>
      </label>
      <label>
        <h3>Address</h3>
        <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="0x…" />
      </label>
      <label>
        <h3>RPC for the lookup</h3>
        <input value={rpc} onChange={(e) => setRpc(e.target.value)} />
      </label>
      {error && <p className="text-red-700">{error}</p>}
      <button
        type="button"
        onClick={() => void add()}
        disabled={!document || !address || !address.startsWith("0x")}
      >
        Add the account
      </button>
    </div>
  );
}
