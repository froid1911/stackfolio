/**
 * `/d/<drive>/<page>` → the drive app's page addressing. Pages render
 * inside the drive app (the node route's component): a sibling under the
 * drive layout never renders, because DriveLayout outlets only the node
 * route. So this route rewrites the path form to the canonical search
 * form (`?page=`) on the node route; unknown segments stay the node
 * route's business (an open document or folder).
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { isPage } from "editors/stackfolio/nav";

export const Route = createFileRoute("/_app/d/$driveSlug/$page")({
  beforeLoad: ({ params }) => {
    if (isPage(params.page)) {
      // The route tree's to:/params typing lags this install's generator;
      // the href is constructed, so the target is exact by inspection:
      // core's node route, drive root, plus the page param.
      // oxlint-disable-next-line typescript/only-throw-error -- router control flow
      throw redirect({
        href: `/d/${params.driveSlug}?page=${params.page}`,
        replace: true,
      } as never);
    }
  },
});
