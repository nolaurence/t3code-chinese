import type { ServerProvider } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

const providers = vi.hoisted(
  () =>
    [
      {
        driver: "piAgent",
        instanceId: "piAgent",
        checkedAt: "2026-07-12T08:00:00.000Z",
        updateState: {
          status: "failed",
          startedAt: "2026-07-12T08:00:01.000Z",
          finishedAt: "2026-07-12T08:00:02.000Z",
          message: "Update failed.",
          output: null,
        },
        versionAdvisory: {
          status: "behind_latest",
          currentVersion: "0.80.3",
          latestVersion: "0.81.0",
          updateCommand: "npm install -g @earendil-works/pi-coding-agent@0.81.0",
          canUpdate: true,
          checkedAt: "2026-07-12T08:00:00.000Z",
          message: null,
        },
      },
    ] as unknown as ReadonlyArray<ServerProvider>,
);

vi.mock("@effect/atom-react", () => ({
  useAtomValue: () => providers,
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("../../state/server", () => ({
  primaryServerProvidersAtom: {},
}));

vi.mock("../../i18n", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../i18n")>();
  return {
    ...actual,
    useI18n: () => ({
      locale: "en" as const,
      setLocale: () => undefined,
      t: actual.createTranslator("en"),
    }),
  };
});

import { SidebarProviderUpdatePill } from "./SidebarProviderUpdatePill";

describe("SidebarProviderUpdatePill", () => {
  it("keeps long status text on one truncated line and collapses to an icon", () => {
    const markup = renderToStaticMarkup(<SidebarProviderUpdatePill />);

    expect(markup).toContain("h-7 min-w-0 w-full");
    expect(markup).toContain("overflow-hidden");
    expect(markup).toContain("min-w-0 truncate whitespace-nowrap");
    expect(markup).toContain("group-data-[collapsible=icon]:hidden");
    expect(markup).toContain("group-data-[collapsible=icon]:justify-center");
  });
});
