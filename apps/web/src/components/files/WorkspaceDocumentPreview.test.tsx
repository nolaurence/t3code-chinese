// @vitest-environment jsdom
import { EnvironmentId, ThreadId, type AssetResource } from "@t3tools/contracts";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import * as XLSX from "xlsx";

import { WorkspaceDocumentPreview } from "./WorkspaceDocumentPreview";

vi.mock("~/assets/assetUrls", () => ({
  useAssetUrlState: (_environmentId: EnvironmentId, resource: AssetResource) => {
    // Model the server's missing-thread response for an unsent draft. Resources
    // naming their own workspace or an absolute media file do not need a thread.
    if (resource._tag === "workspace-file" && resource.threadId === "draft-thread") {
      return { _tag: "Failure" };
    }
    return { _tag: "Success", url: "https://environment.test/report.xlsx" };
  },
}));

describe("workspace spreadsheet preview", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it.each([
    ["xlsx", "draft-thread", "F:\\项目\\调研表.xlsx"],
    ["xlsx", "saved-thread", "F:\\项目\\调研表.xlsx"],
    ["xls", "draft-thread", "F:\\项目\\调研表.xls"],
    ["xlsx", "draft-thread", "F:\\导出\\调研表.xlsx"],
  ] as const)("renders %s for %s at %s", async (bookType, threadId, absolutePath) => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ["产品", "数量"],
        ["狗爪泡泡棒", 30],
      ]),
      "产品调研",
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ["月份", "销量"],
        ["十月", 120],
      ]),
      "销量",
    );
    const bytes: ArrayBuffer = XLSX.write(workbook, { bookType, type: "array" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        headers: new Headers(),
        arrayBuffer: async () => bytes,
      })),
    );

    await act(async () => {
      root.render(
        <WorkspaceDocumentPreview
          environmentId={EnvironmentId.make("test-environment")}
          threadRef={{
            environmentId: EnvironmentId.make("test-environment"),
            threadId: ThreadId.make(threadId),
          }}
          absolutePath={absolutePath}
          workspaceRoot="F:\\项目"
          workspaceMutationId={null}
        />,
      );
    });

    expect(container.querySelector("table")?.textContent).toBe("产品数量狗爪泡泡棒30");
    const salesTab = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "销量",
    );
    expect(salesTab).toBeDefined();
    await act(() => salesTab?.click());
    expect(container.querySelector("table")?.textContent).toBe("月份销量十月120");
  });
});
