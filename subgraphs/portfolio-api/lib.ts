import type { BaseSubgraph, Context } from "@powerhousedao/reactor-api";
import type { DocumentDriveDocument } from "@powerhousedao/shared/document-drive";

/**
 * The ids of the drive's files: the only documents whose rows a query may
 * return. The processor's namespace holds rows from every drive, so the
 * tables alone do not scope to one. Returns null when the drive is not
 * there or the caller may not read it.
 */
export async function driveFileIds(
  subgraph: BaseSubgraph,
  driveId: string,
  ctx: Context,
): Promise<string[] | null> {
  const handle = await subgraph.assertCanRead(driveId, ctx);
  const drive = (await ctx.clients.read.get(
    handle.fetchIdentifier,
  )) as DocumentDriveDocument | null;
  if (!drive) return null;
  // A document id passed where a drive belongs gets this far; it names no files.
  const nodes = (drive.state?.global as { nodes?: unknown } | undefined)?.nodes;
  if (!Array.isArray(nodes)) return [];
  return nodes
    .filter((node) => node.kind === "file")
    .map((node) => node.id);
}
