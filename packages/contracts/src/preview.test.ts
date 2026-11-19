import { Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { EnvironmentId, ThreadId } from "./baseSchemas.ts";
import {
  PreviewAutomationHost,
  PreviewAutomationScrollInput,
  PreviewAutomationInvalidSelectorError,
  PreviewAutomationStatus,
} from "./previewAutomation.ts";
import { ProviderInstanceId } from "./providerInstance.ts";

const decodeAutomationHost = Schema.decodeUnknownSync(PreviewAutomationHost);
const decodeAutomationStatus = Schema.decodeUnknownSync(PreviewAutomationStatus);
const decodeAutomationScroll = Schema.decodeUnknownSync(PreviewAutomationScrollInput);

describe("PreviewAutomationScrollInput", () => {
  it("accepts a coordinate target and rejects ambiguous targets", () => {
    expect(decodeAutomationScroll({ deltaY: 400, x: 120, y: 240 })).toMatchObject({
      deltaY: 400,
      x: 120,
      y: 240,
    });
    expect(() => decodeAutomationScroll({ deltaY: 400, x: 120 })).toThrow();
    expect(() =>
      decodeAutomationScroll({ deltaY: 400, x: 120, y: 240, locator: "role=list" }),
    ).toThrow();
  });
});

describe("PreviewAutomationHost", () => {
  it("accepts legacy hosts and current operation advertisements", () => {
    expect(decodeAutomationHost({ clientId: "legacy", environmentId: "environment-1" })).toEqual({
      clientId: "legacy",
      environmentId: "environment-1",
    });
    expect(
      decodeAutomationHost({
        clientId: "current",
        environmentId: "environment-1",
        supportedOperations: ["status", "resize"],
        supportedFeatures: ["coordinateScrollWheel"],
      }).supportedOperations,
    ).toEqual(["status", "resize"]);
    expect(
      decodeAutomationHost({
        clientId: "current",
        environmentId: "environment-1",
        supportedOperations: ["scroll"],
        supportedFeatures: ["coordinateScrollWheel"],
      }).supportedFeatures,
    ).toEqual(["coordinateScrollWheel"]);
    expect(() =>
      decodeAutomationHost({
        clientId: "unsupported-feature",
        environmentId: "environment-1",
        supportedOperations: ["scroll"],
        supportedFeatures: ["coordinateDomScroll"],
      }),
    ).toThrow();
  });
});

describe("PreviewAutomationStatus", () => {
  it("accepts old hosts without viewport data and exposes it from current hosts", () => {
    const base = {
      available: true,
      visible: false,
      tabId: "preview-t",
      url: "https://example.com",
      title: "Example",
      loading: false,
    };
    expect(decodeAutomationStatus(base)).toEqual(base);
    expect(
      decodeAutomationStatus({
        ...base,
        viewportSetting: { _tag: "preset", presetId: "pixel-8", width: 412, height: 915 },
        viewport: { width: 412, height: 915 },
      }).viewport,
    ).toEqual({ width: 412, height: 915 });
  });
});

describe("PreviewAutomationInvalidSelectorError", () => {
  const invalidSelector = (selectorKind: "locator" | "selector") =>
    new PreviewAutomationInvalidSelectorError({
      operation: "click",
      environmentId: EnvironmentId.make("environment-1"),
      threadId: ThreadId.make("thread-1"),
      providerSessionId: "session-1",
      providerInstanceId: ProviderInstanceId.make("claude"),
      clientId: "desktop",
      connectionId: "connection-1",
      requestId: "request-1",
      timeoutMs: 15_000,
      remoteTag: "Error",
      remoteMessageLength: 0,
      cause: null,
      selectorKind,
      selectorLength: 42,
    });

  it("tells agents which locator forms are accepted and where CSS goes", () => {
    const { message } = invalidSelector("locator");
    expect(message).toContain("aria-ref=");
    expect(message).toMatch(/role/);
    expect(message).toMatch(/text/);
    expect(message).toMatch(/CSS[^.]*\bselector\b/);
  });

  it("points an invalid CSS selector at the locator alternative", () => {
    const { message } = invalidSelector("selector");
    expect(message).toMatch(/CSS/);
    expect(message).toMatch(/\blocator\b/);
    expect(message).toContain("aria-ref=");
  });
});
