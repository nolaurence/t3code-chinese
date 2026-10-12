import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import { mediaFileReference } from "@t3tools/client-runtime/media-reference";
import { useEffect, useMemo, useRef, useState } from "react";

import { useAssetUrlState } from "~/assets/assetUrls";
import { cn } from "~/lib/utils";

import { Spinner } from "~/components/ui/spinner";

type DocumentPreviewType = "docx" | "xlsx" | "pptx";

/** Generous bound: a document larger than this would exhaust the tab's memory when parsed. */
const DOCUMENT_PREVIEW_MAX_BYTES = 100 * 1024 * 1024;

function documentPreviewType(path: string): DocumentPreviewType | null {
  const extension = path.slice(path.lastIndexOf(".")).toLowerCase();
  if (extension === ".docx") return "docx";
  if (extension === ".pptx") return "pptx";
  if (extension === ".xlsx" || extension === ".xls") return "xlsx";
  return null;
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

function XlsxSurface(props: { sheets: ReadonlyArray<{ name: string; html: string }> }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = props.sheets[Math.min(activeIndex, props.sheets.length - 1)];
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
        <div
          className={cn(
            "w-max min-w-full text-xs",
            "[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_td]:whitespace-nowrap",
            "[&_tr:first-child_td]:bg-muted [&_tr:first-child_td]:font-medium",
          )}
          // SheetJS escapes cell text while serializing the sheet to HTML.
          dangerouslySetInnerHTML={{ __html: active?.html ?? "" }}
        />
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
  const insideWorkspace =
    mediaFileReference(props.absolutePath, props.workspaceRoot).relativePath !== undefined;
  const resource = useMemo(
    () => ({
      _tag: insideWorkspace ? ("workspace-file" as const) : ("media-file" as const),
      threadId: props.threadRef.threadId,
      path: props.absolutePath,
    }),
    [insideWorkspace, props.threadRef.threadId, props.absolutePath],
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
    sheets?: ReadonlyArray<{ name: string; html: string }>;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (url === null || type === null) return;
    let cancelled = false;
    setLoad({ url, status: "loading" });
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
            return sheet
              ? [
                  {
                    name,
                    html: XLSX.utils.sheet_to_html(sheet, { header: "", footer: "" }),
                  },
                ]
              : [];
          });
          if (!cancelled) setLoad({ url, status: "ready", sheets });
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
