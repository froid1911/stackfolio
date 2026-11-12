import {
  ambientRenownTokenProvider,
  DriveCollectionId,
  getPHStore,
  getSwitchboardBaseFromChannelUrl,
  recordBackendAuthError,
} from "@powerhousedao/reactor-browser";

/**
 * One GraphQL call to the reactor's supergraph, carried the logged-in
 * Renown user's bearer the way the framework's own switchboard client does,
 * so a switchboard that requires an authenticated caller answers it. A
 * refusal is recorded on the backend-auth store, which Connect turns into
 * the sign-in gate instead of a broken view.
 *
 * Which switchboard answers: a synchronized remote drive's channel URL
 * names its own; otherwise the switchboard this app already talks to —
 * the one the attachment service uses, which is the origin every read and
 * write goes to, or the host's configured URL.
 */
export async function gql<T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const url = switchboardUrlFor(
    typeof variables.driveId === "string" ? variables.driveId : "",
  );
  const token = await ambientRenownTokenProvider();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });
  if (response.status === 401 || response.status === 403) {
    const error = Object.assign(new Error(`The portfolio index answered ${response.status}`), {
      response: { status: response.status },
    });
    recordBackendAuthError(error, "switchboard");
    throw error;
  }
  const json = (await response.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) {
    const error = new Error(json.errors[0].message);
    recordBackendAuthError(error, "switchboard");
    throw error;
  }
  if (!json.data) throw new Error("The portfolio index answered no data");
  return json.data;
}

function switchboardUrlFor(driveId: string): string {
  const store = getPHStore() as
    | {
        reactorClientModule?: {
          kind?: string;
          reactorModule?: {
            syncModule?: { syncManager?: { list?: () => SyncRemote[] } };
          };
        };
        attachmentService?: unknown;
        switchboardUrl?: string;
      }
    | undefined;
  const remotes =
    store?.reactorClientModule?.reactorModule?.syncModule?.syncManager?.list?.() ?? [];
  const remote = remotes.find((entry) =>
    entry.meta.collectionId.equals(DriveCollectionId.forDrive(driveId)),
  );
  const channelUrl = (remote?.channel as { config?: { url?: unknown } } | undefined)?.config
    ?.url;
  if (typeof channelUrl === "string" && channelUrl) {
    return `${getSwitchboardBaseFromChannelUrl(channelUrl)}/graphql`;
  }
  const attach = (
    store?.attachmentService as { store?: { remoteUrl?: unknown } } | undefined
  )?.store?.remoteUrl;
  if (typeof attach === "string" && attach) {
    return `${attach.replace(/\/$/, "")}/graphql`;
  }
  if (typeof store?.switchboardUrl === "string" && store.switchboardUrl) {
    return store.switchboardUrl;
  }
  throw new Error("The reactor's GraphQL endpoint is not ready");
}

interface SyncRemote {
  meta: { collectionId: { equals: (other: unknown) => boolean } };
  channel?: unknown;
}
