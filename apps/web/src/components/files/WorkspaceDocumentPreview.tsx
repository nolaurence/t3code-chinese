import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import { mediaFileReference } from "@t3tools/client-runtime/media-reference";
import type JSZip from "jszip";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { useAssetUrlState } from "~/assets/assetUrls";
import { cn } from "~/lib/utils";

import { Spinner } from "~/components/ui/spinner";

type DocumentPreviewType = "docx" | "xlsx" | "pptx";

/** Generous bound: a document larger than this would exhaust the tab's memory when parsed. */
const DOCUMENT_PREVIEW_MAX_BYTES = 100 * 1024 * 1024;

/** Office drawing offsets and extents are EMU; 9525 EMU = 1 CSS pixel at 96dpi. */
const EMU_PER_PIXEL = 9525;

const EMPTY_SHEET_IMAGES: readonly SheetImageAnchor[] = [];

const IMAGE_MIME_BY_EXTENSION = new Map([
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["gif", "image/gif"],
  ["webp", "image/webp"],
  ["bmp", "image/bmp"],
  ["svg", "image/svg+xml"],
]);

interface SheetImageAnchorPoint {
  col: number;
  row: number;
  colOff: number;
  rowOff: number;
}

interface SheetImageAnchor {
  url: string;
  from: SheetImageAnchorPoint;
  to: SheetImageAnchorPoint | null;
  ext: { width: number; height: number } | null;
}

interface SheetTableCellRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface XlsxImageBox {
  url: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

interface XlsxSheetRender {
  name: string;
  html: string;
  images: readonly SheetImageAnchor[];
  /** First row/column of the sheet's used range; the HTML table starts there. */
  rangeStart: { row: number; col: number };
}

function documentPreviewType(path: string): DocumentPreviewType | null {
  const extension = path.slice(path.lastIndexOf(".")).toLowerCase();
  if (extension === ".docx") return "docx";
  if (extension === ".pptx") return "pptx";
  if (extension === ".xlsx" || extension === ".xls") return "xlsx";
  return null;
}

function xmlElements(root: Element | Document, localName: string): Element[] {
  return Array.from(root.getElementsByTagNameNS("*", localName));
}

function xmlAttribute(element: Element | null, ...names: string[]): string | null {
  if (!element) return null;
  for (const name of names) {
    const value = element.getAttribute(name);
    if (value !== null && value !== "") return value;
  }
  return null;
}

/** Resolves an OOXML relationship target (`../media/image1.png`) against its part directory. */
function resolveZipPath(baseDirectory: string, target: string): string {
  const segments = (
    target.startsWith("/") ? target.slice(1) : `${baseDirectory}${target}`
  ).split("/");
  const resolved: string[] = [];
  for (const segment of segments) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") resolved.pop();
    else resolved.push(segment);
  }
  return resolved.join("/");
}

function relsForZipPart(
  zip: JSZip,
  parseXml: (partPath: string) => Promise<Document | null>,
  partPath: string,
): Promise<Map<string, string>> {
  const directory = partPath.slice(0, partPath.lastIndexOf("/") + 1);
  return parseXml(`${directory}_rels/${partPath.slice(directory.length)}.rels`).then((relsDoc) => {
    const targets = new Map<string, string>();
    if (!relsDoc) return targets;
    for (const rel of xmlElements(relsDoc, "Relationship")) {
      const id = xmlAttribute(rel, "Id");
      const target = xmlAttribute(rel, "Target");
      if (id && target) targets.set(id, resolveZipPath(directory, target));
    }
    return targets;
  });
}

/**
 * Extracts the images embedded in a workbook: SheetJS does not decode
 * drawings, so the xlsx is opened as a zip and each sheet's drawing anchors
 * are matched to their media entries. Images the browser cannot render
 * (EMF/WMF metafiles) are skipped.
 */
export async function parseWorkbookImages(
  buffer: ArrayBuffer,
): Promise<ReadonlyMap<string, readonly SheetImageAnchor[]>> {
  const zip = await (await import("jszip")).default.loadAsync(buffer);
  const parser = new DOMParser();
  const parseXml = async (partPath: string): Promise<Document | null> => {
    const entry = zip.file(partPath);
    if (!entry) return null;
    return parser.parseFromString(await entry.async("string"), "application/xml");
  };
  const readAnchorPoint = (parent: Element | null): SheetImageAnchorPoint | null => {
    const col = parent ? (xmlElements(parent, "col")[0] ?? null) : null;
    const row = parent ? (xmlElements(parent, "row")[0] ?? null) : null;
    const colOff = parent ? (xmlElements(parent, "colOff")[0] ?? null) : null;
    const rowOff = parent ? (xmlElements(parent, "rowOff")[0] ?? null) : null;
    if (!col || !row || !colOff || !rowOff) return null;
    const colIndex = Number(col.textContent);
    const rowIndex = Number(row.textContent);
    if (!Number.isFinite(colIndex) || !Number.isFinite(rowIndex)) return null;
    return {
      col: colIndex,
      row: rowIndex,
      colOff: (Number(colOff.textContent) || 0) / EMU_PER_PIXEL,
      rowOff: (Number(rowOff.textContent) || 0) / EMU_PER_PIXEL,
    };
  };

  const workbookDoc = await parseXml("xl/workbook.xml");
  if (!workbookDoc) return new Map();
  const workbookRels = await relsForZipPart(zip, parseXml, "xl/workbook.xml");
  const imagesBySheet = new Map<string, SheetImageAnchor[]>();
  for (const sheetElement of xmlElements(workbookDoc, "sheet")) {
    const sheetName = xmlAttribute(sheetElement, "name");
    const sheetRelId = xmlAttribute(sheetElement, "r:id", "id");
    if (!sheetName || !sheetRelId) continue;
    const sheetPath = workbookRels.get(sheetRelId);
    if (!sheetPath) continue;
    const sheetDoc = await parseXml(sheetPath);
    const drawingRelId = sheetDoc
      ? xmlAttribute(xmlElements(sheetDoc, "drawing")[0] ?? null, "r:id", "id")
      : null;
    if (!drawingRelId) continue;
    const sheetRels = await relsForZipPart(zip, parseXml, sheetPath);
    const drawingPath = sheetRels.get(drawingRelId);
    if (!drawingPath) continue;
    const drawingDoc = await parseXml(drawingPath);
    if (!drawingDoc) continue;
    const drawingRels = await relsForZipPart(zip, parseXml, drawingPath);
    const anchors: SheetImageAnchor[] = [];
    for (const anchorElement of [
      ...xmlElements(drawingDoc, "twoCellAnchor"),
      ...xmlElements(drawingDoc, "oneCellAnchor"),
    ]) {
      const from = readAnchorPoint(xmlElements(anchorElement, "from")[0] ?? null);
      const blip = xmlElements(anchorElement, "blip")[0] ?? null;
      const embedId = xmlAttribute(blip, "r:embed", "embed");
      const mediaPath = embedId ? (drawingRels.get(embedId) ?? null) : null;
      const mediaEntry = mediaPath ? (zip.file(mediaPath) ?? null) : null;
      if (!from || !mediaPath || !mediaEntry) continue;
      const mimeType = IMAGE_MIME_BY_EXTENSION.get(
        mediaPath.slice(mediaPath.lastIndexOf(".") + 1).toLowerCase(),
      );
      if (!mimeType) continue;
      const bytes = await mediaEntry.async("arraybuffer");
      const extElement = xmlElements(anchorElement, "ext")[0] ?? null;
      const extCx = Number(xmlAttribute(extElement, "cx"));
      const extCy = Number(xmlAttribute(extElement, "cy"));
      anchors.push({
        url: URL.createObjectURL(new Blob([bytes], { type: mimeType })),
        from,
        to: readAnchorPoint(xmlElements(anchorElement, "to")[0] ?? null),
        ext:
          Number.isFinite(extCx) && Number.isFinite(extCy)
            ? { width: extCx / EMU_PER_PIXEL, height: extCy / EMU_PER_PIXEL }
            : null,
      });
    }
    if (anchors.length > 0) imagesBySheet.set(sheetName, anchors);
  }
  return imagesBySheet;
}

/**
 * Grid position of every rendered table cell, keyed by `row:col` grid index.
 * Merged cells span multiple grid slots, so the walk tracks occupancy like
 * the HTML table layout algorithm does instead of trusting child order.
 */
function tableCellRects(
  table: HTMLTableElement,
  origin: DOMRect,
): Map<string, SheetTableCellRect> {
  const cells = new Map<string, SheetTableCellRect>();
  const occupied = new Set<string>();
  for (let rowIndex = 0; rowIndex < table.rows.length; rowIndex += 1) {
    const row = table.rows[rowIndex];
    if (!row) continue;
    let columnIndex = 0;
    for (const cell of row.cells) {
      while (occupied.has(`${rowIndex}:${columnIndex}`)) columnIndex += 1;
      const rowSpan = cell.rowSpan || 1;
      const colSpan = cell.colSpan || 1;
      for (let r = 0; r < rowSpan; r += 1) {
        for (let c = 0; c < colSpan; c += 1) occupied.add(`${rowIndex + r}:${columnIndex + c}`);
      }
      const rect = cell.getBoundingClientRect();
      cells.set(`${rowIndex}:${columnIndex}`, {
        left: rect.left - origin.left,
        top: rect.top - origin.top,
        width: rect.width,
        height: rect.height,
      });
      columnIndex += colSpan;
    }
  }
  return cells;
}

/** Anchors may point past the used range the table was rendered from; clamp those to the table edge. */
function cellRectAt(
  cells: Map<string, SheetTableCellRect>,
  col: number,
  row: number,
  tableWidth: number,
  tableHeight: number,
): SheetTableCellRect {
  return (
    cells.get(`${row}:${col}`) ?? { left: tableWidth, top: tableHeight, width: 0, height: 0 }
  );
}

function sheetImageBox(
  image: SheetImageAnchor,
  cells: Map<string, SheetTableCellRect>,
  rangeStart: XlsxSheetRender["rangeStart"],
  tableWidth: number,
  tableHeight: number,
): XlsxImageBox | null {
  const from = cellRectAt(
    cells,
    image.from.col - rangeStart.col,
    image.from.row - rangeStart.row,
    tableWidth,
    tableHeight,
  );
  const left = from.left + image.from.colOff;
  const top = from.top + image.from.rowOff;
  let width: number;
  let height: number;
  const toAnchor = image.to;
  const to = toAnchor
    ? cellRectAt(
        cells,
        toAnchor.col - rangeStart.col,
        toAnchor.row - rangeStart.row,
        tableWidth,
        tableHeight,
      )
    : null;
  if (to && toAnchor) {
    width = Math.max(1, to.left + toAnchor.colOff - left);
    height = Math.max(1, to.top + toAnchor.rowOff - top);
  } else if (image.ext) {
    width = Math.max(1, image.ext.width);
    height = Math.max(1, image.ext.height);
  } else {
    return null;
  }
  return { url: image.url, left, top, width, height };
}

function DocumentPreviewError(props: { message: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
      <p className="text-xs leading-relaxed text-destructive">{props.message}</p>
      <button
        type="button"
        className="cursor-pointer rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
        onClick={props.onRetry}
      >
        Retry
      </button>
    </div>
  );
}

function DocxSurface(props: { html: string }) {
  return (
    <div className="min-h-0 flex-1 overflow-auto bg-background p-6">
      <div
        className={cn(
          "mx-auto max-w-3xl text-sm leading-relaxed",
          "[&_a]:text-primary [&_a]:underline",
          "[&_img]:max-w-full [&_img]:h-auto",
          "[&_li]:ml-5 [&_ol]:list-decimal [&_ul]:list-disc",
          "[&_p]:my-2",
          "[&_table]:mt-2 [&_table]:mb-2 [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs",
          "[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_td]:align-top",
          "[&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-2 [&_th]:py-1 [&_th]:text-left",
        )}
        // Mammoth escapes document text while converting to HTML; the source
        // is the user's own workspace file, like the raw text preview.
        dangerouslySetInnerHTML={{ __html: props.html }}
      />
    </div>
  );
}

function XlsxSurface(props: { sheets: ReadonlyArray<XlsxSheetRender> }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = props.sheets[Math.min(activeIndex, props.sheets.length - 1)];
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [imageBoxes, setImageBoxes] = useState<readonly XlsxImageBox[]>([]);

  // Drawings are positioned from the rendered table's real cell metrics, so
  // the measurement has to run after the sheet's HTML is in the DOM.
  useLayoutEffect(() => {
    const host = hostRef.current;
    const images = active?.images ?? EMPTY_SHEET_IMAGES;
    if (!host || images.length === 0 || !active) {
      setImageBoxes((current) => (current.length === 0 ? current : []));
      return;
    }
    const table = host.querySelector("table");
    if (!table) return;
    const hostRect = host.getBoundingClientRect();
    const cells = tableCellRects(table, hostRect);
    const tableRect = table.getBoundingClientRect();
    setImageBoxes(
      images.flatMap((image) => {
        const box = sheetImageBox(
          image,
          cells,
          active.rangeStart,
          tableRect.width,
          tableRect.height,
        );
        return box ? [box] : [];
      }),
    );
  }, [active]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {props.sheets.length > 1 ? (
        <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border px-2 py-1">
          {props.sheets.map((sheet, index) => (
            <button
              key={sheet.name}
              type="button"
              className={cn(
                "cursor-pointer rounded-md px-2 py-0.5 text-xs whitespace-nowrap",
                index === activeIndex
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
              onClick={() => setActiveIndex(index)}
            >
              {sheet.name}
            </button>
          ))}
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div ref={hostRef} className="relative w-max min-w-full">
          <div
            className={cn(
              "text-xs",
              "[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_td]:whitespace-nowrap",
              "[&_tr:first-child_td]:bg-muted [&_tr:first-child_td]:font-medium",
            )}
            // SheetJS escapes cell text while serializing the sheet to HTML.
            dangerouslySetInnerHTML={{ __html: active?.html ?? "" }}
          />
          {imageBoxes.map((box, index) => (
            <img
              key={`${box.url}-${index}`}
              src={box.url}
              alt=""
              aria-hidden
              className="pointer-events-none absolute max-w-none select-none"
              style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function PptxSurface(props: { url: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let destroyed = false;
    let previewer: {
      destroy: () => void;
      preview: (file: ArrayBuffer) => Promise<unknown>;
    } | null = null;
    setFailed(false);
    void (async () => {
      try {
        const response = await fetch(props.url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const buffer = await response.arrayBuffer();
        if (destroyed) return;
        const { init } = await import("pptx-preview");
        if (destroyed) return;
        const width = Math.max(320, container.clientWidth - 32);
        previewer = init(container, {
          width,
          height: Math.round(width * (9 / 16)),
          mode: "list",
        });
        await previewer.preview(buffer);
        if (destroyed) previewer.destroy();
      } catch {
        if (!destroyed) setFailed(true);
      }
    })();
    return () => {
      destroyed = true;
      previewer?.destroy();
    };
  }, [props.url]);

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-background p-4">
      {failed ? (
        <div className="flex h-full items-center justify-center text-xs leading-relaxed text-destructive">
          Unable to render presentation.
        </div>
      ) : (
        <div ref={containerRef} className="mx-auto w-full" />
      )}
    </div>
  );
}

/**
 * Renders a Word, Excel or PowerPoint document in place from its signed asset
 * URL. The bytes are parsed in the browser by lazily loaded renderers, so no
 * tab kind or server-side conversion is needed.
 */
export function WorkspaceDocumentPreview(props: {
  readonly environmentId: EnvironmentId;
  readonly threadRef: ScopedThreadRef;
  readonly absolutePath: string;
  readonly workspaceRoot: string;
  readonly workspaceMutationId: string | null;
}) {
  const type = documentPreviewType(props.absolutePath);
  const relativePath = mediaFileReference(props.absolutePath, props.workspaceRoot).relativePath;
  // The panel already knows its workspace root. Naming it directly lets
  // documents load before a draft's thread has been created on the server.
  const resource = useMemo(
    () =>
      relativePath !== undefined
        ? {
            _tag: "draft-workspace-file" as const,
            cwd: props.workspaceRoot,
            path: relativePath,
          }
        : {
            _tag: "media-file" as const,
            threadId: props.threadRef.threadId,
            path: props.absolutePath,
          },
    [relativePath, props.workspaceRoot, props.threadRef.threadId, props.absolutePath],
  );
  const assetUrl = useAssetUrlState(props.environmentId, resource);
  const revisionSuffix =
    props.workspaceMutationId === null
      ? ""
      : `${assetUrl._tag === "Success" && assetUrl.url.includes("?") ? "&" : "?"}workspace-revision=${encodeURIComponent(props.workspaceMutationId)}`;
  const url = assetUrl._tag === "Success" ? `${assetUrl.url}${revisionSuffix}` : null;

  const [load, setLoad] = useState<{
    url: string;
    status: "loading" | "ready" | "error";
    error?: string;
    docxHtml?: string;
    sheets?: ReadonlyArray<XlsxSheetRender>;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const objectUrlsRef = useRef<string[]>([]);
  useEffect(
    () => () => {
      for (const objectUrl of objectUrlsRef.current) URL.revokeObjectURL(objectUrl);
    },
    [],
  );

  useEffect(() => {
    if (url === null || type === null) return;
    let cancelled = false;
    setLoad({ url, status: "loading" });
    for (const objectUrl of objectUrlsRef.current) URL.revokeObjectURL(objectUrl);
    objectUrlsRef.current = [];
    void (async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const contentLength = Number(response.headers.get("content-length") ?? "0");
        if (contentLength > DOCUMENT_PREVIEW_MAX_BYTES) {
          throw new Error("Document is too large to preview.");
        }
        const buffer = await response.arrayBuffer();
        if (buffer.byteLength > DOCUMENT_PREVIEW_MAX_BYTES) {
          throw new Error("Document is too large to preview.");
        }
        if (type === "docx") {
          const mammoth = await import("mammoth");
          const { value } = await mammoth.convertToHtml({ arrayBuffer: buffer });
          if (!cancelled) setLoad({ url, status: "ready", docxHtml: value });
        } else if (type === "xlsx") {
          const XLSX = await import("xlsx");
          const workbook = XLSX.read(new Uint8Array(buffer), { type: "array" });
          const sheets = workbook.SheetNames.flatMap((name) => {
            const sheet = workbook.Sheets[name];
            if (!sheet) return [];
            const range = sheet["!ref"] ? XLSX.utils.decode_range(sheet["!ref"]) : null;
            return [
              {
                name,
                html: XLSX.utils.sheet_to_html(sheet, { header: "", footer: "" }),
                images: EMPTY_SHEET_IMAGES,
                rangeStart: range ? { row: range.s.r, col: range.s.c } : { row: 0, col: 0 },
              },
            ];
          });
          if (cancelled) return;
          setLoad({ url, status: "ready", sheets });
          // Embedded images are best-effort and unzip asynchronously; the cell
          // table has already painted and they overlay when the anchors land.
          try {
            const imagesBySheet = await parseWorkbookImages(buffer);
            if (cancelled) {
              for (const anchors of imagesBySheet.values()) {
                for (const image of anchors) URL.revokeObjectURL(image.url);
              }
              return;
            }
            objectUrlsRef.current = [...imagesBySheet.values()].flatMap((anchors) =>
              anchors.map((image) => image.url),
            );
            setLoad((current) => {
              if (current === null || current.url !== url || current.sheets === undefined) {
                return current;
              }
              return {
                ...current,
                sheets: current.sheets.map((sheet) => ({
                  ...sheet,
                  images: imagesBySheet.get(sheet.name) ?? EMPTY_SHEET_IMAGES,
                })),
              };
            });
          } catch {
            // Not a zip container (BIFF .xls) or a malformed one; table only.
          }
        } else {
          // pptx-preview drives its own lifecycle off the container; render below.
          if (!cancelled) setLoad({ url, status: "ready" });
        }
      } catch (error) {
        if (!cancelled) {
          setLoad({
            url,
            status: "error",
            error: error instanceof Error ? error.message : "Unable to load document.",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url, type, attempt]);

  if (type === null || assetUrl._tag === "Failure") {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center text-xs leading-relaxed text-destructive">
        Unable to load document preview.
      </div>
    );
  }
  if (assetUrl._tag !== "Success" || url === null) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-muted-foreground">
        <Spinner size="lg" />
      </div>
    );
  }
  if (load === null || load.url !== url) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-muted-foreground">
        <Spinner size="lg" />
      </div>
    );
  }
  if (load.status === "error") {
    return (
      <DocumentPreviewError
        message={load.error ?? "Unable to load document preview."}
        onRetry={() => setAttempt((current) => current + 1)}
      />
    );
  }
  if (load.status === "loading") {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-muted-foreground">
        <Spinner size="lg" />
      </div>
    );
  }
  if (type === "pptx") {
    return <PptxSurface key={url} url={url} />;
  }
  return type === "docx" ? (
    <DocxSurface html={load.docxHtml ?? ""} />
  ) : (
    <XlsxSurface sheets={load.sheets ?? []} />
  );
}
