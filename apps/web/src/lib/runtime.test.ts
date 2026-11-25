import { afterEach, expect, it, vi } from "@effect/vitest";
import { withRelayClientTracing } from "@t3tools/shared/relayTracing";
import * as Effect from "effect/Effect";
import * as Tracer from "effect/Tracer";
import "./runtime";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it.each([false, true])("does not send product traces (desktop: %s)", async (desktop) => {
  vi.resetModules();
  vi.stubEnv("VITE_RELAY_OTLP_TRACES_URL", "https://telemetry.example.test/v1/traces");
  vi.stubEnv("VITE_RELAY_OTLP_TRACES_DATASET", "relay-test");
  vi.stubEnv("VITE_RELAY_OTLP_TRACES_TOKEN", "test-token");
  vi.stubGlobal(
    "window",
    desktop ? { desktopBridge: { getRelayTelemetryEnabled: () => true } } : {},
  );
  const fetchFn = vi.fn<typeof fetch>(async () => new Response(null, { status: 202 }));
  vi.stubGlobal("fetch", fetchFn);
  const { runtime } = await import("./runtime");
  const { setDelegate } = await import("../observability/clientTracer");
  const userSpans: Array<string> = [];

  try {
    const relayWork = Effect.succeed("completed").pipe(
      Effect.withSpan("relay.operation"),
      withRelayClientTracing,
    );
    expect(await runtime.runPromise(relayWork)).toBe("completed");
    setDelegate(
      Tracer.make({
        span(options) {
          userSpans.push(options.name);
          return new Tracer.NativeSpan(options);
        },
      }),
    );
    await runtime.runPromise(relayWork);
    expect(userSpans).toEqual(["relay.operation"]);
  } finally {
    setDelegate(null);
    await runtime.dispose();
  }

  expect(fetchFn).not.toHaveBeenCalled();
});
