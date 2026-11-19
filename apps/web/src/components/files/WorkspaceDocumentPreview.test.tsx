// @vitest-environment jsdom
import { EnvironmentId, ThreadId, type AssetResource } from "@t3tools/contracts";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import JSZip from "jszip";
import * as XLSX from "xlsx";

import { parseWorkbookImages, WorkspaceDocumentPreview } from "./WorkspaceDocumentPreview";

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

describe("workbook embedded image extraction", () => {
  // jsdom does not implement blob URLs; the extractor only needs the calls to exist.
  const createObjectURL = vi.fn(() => "blob:mock-image");
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    Object.defineProperty(URL, "createObjectURL", {
      value: createObjectURL,
      configurable: true,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      value: revokeObjectURL,
      configurable: true,
    });
  });

  it("maps drawing anchors to their sheets and media entries", async () => {
    const zip = new JSZip();
    zip.file(
      "xl/workbook.xml",
      `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="销量" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    );
    zip.file(
      "xl/_rels/workbook.xml.rels",
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`,
    );
    zip.file(
      "xl/worksheets/sheet1.xml",
      `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><drawing r:id="rId1"/></worksheet>`,
    );
    zip.file(
      "xl/worksheets/_rels/sheet1.xml.rels",
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="../drawings/drawing1.xml"/></Relationships>`,
    );
    zip.file(
      "xl/drawings/drawing1.xml",
      `<wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><twoCellAnchor><from><col>1</col><colOff>9525</colOff><row>2</row><rowOff>19050</rowOff></from><to><col>3</col><colOff>0</colOff><row>5</row><rowOff>0</rowOff></to><pic><blipFill><blip r:embed="rId1"/></blipFill></pic><clientData/></twoCellAnchor></wsDr>`,
    );
    zip.file(
      "xl/drawings/_rels/drawing1.xml.rels",
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="../media/image1.png"/></Relationships>`,
    );
    zip.file("xl/media/image1.png", new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
    const buffer = await zip.generateAsync({ type: "arraybuffer" });

    const imagesBySheet = await parseWorkbookImages(buffer);
    const anchors = imagesBySheet.get("销量");
    expect(anchors).toHaveLength(1);
    expect(anchors?.[0]).toMatchObject({
      from: { col: 1, row: 2, colOff: 1, rowOff: 2 },
      to: { col: 3, row: 5, colOff: 0, rowOff: 0 },
    });
    expect(createObjectURL).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: "image/png" }),
    );
  });

  it("returns nothing for a workbook that is not a zip container", async () => {
    const bytes: ArrayBuffer = XLSX.write(
      (() => {
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["a"]]), "S");
        return workbook;
      })(),
      { bookType: "xls", type: "array" },
    );
    // The component catches this and renders the table without images.
    await expect(parseWorkbookImages(bytes)).rejects.toThrow(/central directory/);
  });
});
