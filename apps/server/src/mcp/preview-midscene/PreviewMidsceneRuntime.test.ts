import { expect, it } from "@effect/vitest";
import type { Agent as MidsceneAgent } from "@midscene/core";
import type { ModelRuntime } from "@midscene/core/ai-model";
import * as Effect from "effect/Effect";

import * as PreviewMidsceneRuntime from "./PreviewMidsceneRuntime.ts";

it.effect("loads and caches the pinned Midscene runtime modules on first use", () =>
  Effect.gen(function* () {
    const runtime = yield* PreviewMidsceneRuntime.make;

    const first = yield* runtime.load("act");
    const second = yield* runtime.load("query");

    expect(first.defineActions).toBe(second.defineActions);
    expect(first.createAgent).toBeTypeOf("function");
    expect(second.createAgent).toBeTypeOf("function");
  }),
);

it("returns ordinary assertion failures with their model reasoning", async () => {
  const signal = new AbortController().signal;
  const modelConfig = { marker: "model-config" };
  const modelRuntime = { marker: "model-runtime" } as unknown as ModelRuntime;
  let executionArguments: ReadonlyArray<unknown> | undefined;
  const agent = {
    modelConfigManager: {
      getModelConfig: (intent: string) => {
        expect(intent).toBe("insight");
        return modelConfig;
      },
    },
    taskExecutor: {
      createTypeQueryExecution: async (...args: ReadonlyArray<unknown>) => {
        executionArguments = args;
        return { output: false, thought: "The dialog is still visible." };
      },
    },
  } as unknown as Pick<MidsceneAgent, "modelConfigManager" | "taskExecutor">;

  const result = await PreviewMidsceneRuntime.runMidsceneAssertion(
    agent,
    (config) => {
      expect(config).toBe(modelConfig);
      return modelRuntime;
    },
    "The dialog is closed",
    signal,
  );

  expect(result).toEqual({ pass: false, reason: "The dialog is still visible." });
  expect(executionArguments).toEqual([
    "Boolean",
    "whether the following statement is true: The dialog is closed",
    modelRuntime,
    { domIncluded: false, screenshotIncluded: true },
    undefined,
    { abortSignal: signal },
  ]);
});

it("propagates assertion execution errors instead of exposing them as reasons", async () => {
  const upstreamError = new Error("RAW_UPSTREAM_ASSERTION_ERROR");
  const agent = {
    modelConfigManager: { getModelConfig: () => ({}) },
    taskExecutor: {
      createTypeQueryExecution: async () => {
        throw upstreamError;
      },
    },
  } as unknown as Pick<MidsceneAgent, "modelConfigManager" | "taskExecutor">;

  await expect(
    PreviewMidsceneRuntime.runMidsceneAssertion(
      agent,
      () => ({}) as ModelRuntime,
      "The dialog is closed",
      new AbortController().signal,
    ),
  ).rejects.toBe(upstreamError);
});
