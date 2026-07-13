import type { PreviewAutomationSnapshot, PreviewAutomationStatus } from "@t3tools/contracts";
import type { LocateResultElement } from "@midscene/core";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  parseMidsceneKeyName,
  T3PreviewInterface,
  type T3PreviewOperations,
} from "./T3PreviewInterface.ts";

const status: PreviewAutomationStatus = {
  available: true,
  visible: true,
  tabId: "tab-midscene",
  url: "https://example.com",
  title: "Example",
  loading: false,
  viewport: { width: 1_024, height: 768 },
};

const snapshot: PreviewAutomationSnapshot = {
  url: "https://example.com",
  title: "Example",
  loading: false,
  visibleText: "Example",
  interactiveElements: [],
  accessibilityTree: null,
  consoleEntries: [],
  networkEntries: [],
  actionTimeline: [],
  screenshot: {
    mimeType: "image/png",
    data: "cHJldmlldy1wbmc=",
    width: 1_024,
    height: 768,
  },
};

const locatedElement: LocateResultElement = {
  description: "Search field",
  center: [320, 180],
  rect: { left: 200, top: 150, width: 240, height: 60 },
};

const makeOperations = (overrides: Partial<T3PreviewOperations> = {}): T3PreviewOperations => ({
  status: vi.fn(async () => status),
  snapshot: vi.fn(async () => snapshot),
  click: vi.fn(async () => undefined),
  type: vi.fn(async () => undefined),
  press: vi.fn(async () => undefined),
  scroll: vi.fn(async () => undefined),
  ...overrides,
});

const makeInterface = (operations = makeOperations()) => ({
  preview: new T3PreviewInterface(operations, () => []),
  operations,
});

describe("T3PreviewInterface", () => {
  it("converts preview PNG snapshots to Midscene data URIs and reports CSS viewport size", async () => {
    const { preview, operations } = makeInterface();

    await expect(preview.screenshotBase64()).resolves.toBe(
      "data:image/png;base64,cHJldmlldy1wbmc=",
    );
    await expect(preview.size()).resolves.toEqual({ width: 1_024, height: 768 });
    expect(operations.snapshot).toHaveBeenCalledOnce();
    expect(operations.status).toHaveBeenCalledOnce();
  });

  it("fails clearly when the preview host cannot report a viewport", async () => {
    const { preview } = makeInterface(
      makeOperations({
        status: vi.fn(async () => {
          const { viewport: _viewport, ...withoutViewport } = status;
          return withoutViewport;
        }),
      }),
    );

    await expect(preview.size()).rejects.toThrow("The T3 preview viewport is unavailable.");
  });

  it("maps pointer taps to viewport-relative preview clicks", async () => {
    const { preview, operations } = makeInterface();

    await preview.inputPrimitives.pointer!.tap({ x: 45, y: 90 });

    expect(operations.click).toHaveBeenCalledWith({ x: 45, y: 90 });
  });

  it("focuses located inputs before typing, replacing, or clearing their value", async () => {
    const activity: Array<unknown> = [];
    const operations = makeOperations({
      click: vi.fn(async (input) => {
        activity.push(["click", input]);
      }),
      type: vi.fn(async (input) => {
        activity.push(["type", input]);
      }),
    });
    const { preview } = makeInterface(operations);

    await preview.inputPrimitives.keyboard!.typeText("hello", {
      target: locatedElement,
      replace: true,
    });
    await preview.inputPrimitives.keyboard!.typeText(" world", {
      target: locatedElement,
      replace: false,
    });
    await preview.inputPrimitives.keyboard!.clearInput(locatedElement);

    expect(activity).toEqual([
      ["click", { x: 320, y: 180 }],
      ["type", { text: "hello", clear: true }],
      ["click", { x: 320, y: 180 }],
      ["type", { text: " world", clear: false }],
      ["click", { x: 320, y: 180 }],
      ["type", { text: "", clear: true }],
    ]);
  });

  it("focuses a located target and maps Midscene key aliases to preview modifiers", async () => {
    const activity: Array<unknown> = [];
    const operations = makeOperations({
      click: vi.fn(async (input) => {
        activity.push(["click", input]);
      }),
      press: vi.fn(async (input) => {
        activity.push(["press", input]);
      }),
    });
    const { preview } = makeInterface(operations);

    await preview.inputPrimitives.keyboard!.keyboardPress("Ctrl+Shift+Enter", {
      target: locatedElement,
    });

    expect(activity).toEqual([
      ["click", { x: 320, y: 180 }],
      ["press", { key: "Enter", modifiers: ["Control", "Shift"] }],
    ]);
    expect(parseMidsceneKeyName("command+option+K")).toEqual({
      key: "K",
      modifiers: ["Meta", "Alt"],
    });
    expect(parseMidsceneKeyName("+")).toEqual({ key: "+" });
  });

  it("maps scroll direction, distance, boundaries, and located container coordinates", async () => {
    const { preview, operations } = makeInterface();

    await preview.inputPrimitives.scroll!.scroll({
      scrollType: "singleAction",
      direction: "up",
      distance: 240,
      locate: locatedElement,
    });
    await preview.inputPrimitives.scroll!.scroll({
      scrollType: "scrollToRight",
      direction: "down",
    });

    expect(operations.scroll).toHaveBeenNthCalledWith(1, {
      deltaX: 0,
      deltaY: -240,
      x: 320,
      y: 180,
    });
    expect(operations.scroll).toHaveBeenNthCalledWith(2, {
      deltaX: 1_000_000,
      deltaY: 0,
    });
    expect(operations.status).toHaveBeenCalledTimes(2);
  });

  it("builds its action space from the exact input primitive instance", () => {
    const operations = makeOperations();
    const actions = [{ name: "Tap" }] as never;
    const defineActions = vi.fn(() => actions);
    const preview = new T3PreviewInterface(operations, defineActions);

    expect(preview.actionSpace()).toEqual(actions);
    expect(preview.actionSpace()).not.toBe(actions);
    expect(defineActions).toHaveBeenCalledWith(preview.inputPrimitives);
  });
});
