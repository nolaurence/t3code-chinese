import {
  PreviewMidsceneRuntimeUnavailableError,
  type PreviewMidsceneOperation,
} from "@t3tools/contracts";
import type { Agent as MidsceneAgent, AIUsageInfo, MidsceneUsageMetrics } from "@midscene/core";
import type { AbstractInterface, InputPrimitives } from "@midscene/core/device";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import type { DefineMidsceneActions } from "./T3PreviewInterface.ts";

export interface PreviewMidsceneAgentHandle {
  readonly act: (
    instruction: string,
    options: {
      readonly signal: AbortSignal;
      readonly deepThink?: boolean;
      readonly deepLocate?: boolean;
    },
  ) => Promise<string | undefined>;
  readonly query: (
    demand: string,
    signal: AbortSignal,
  ) => Promise<{ readonly value: unknown; readonly usage?: AIUsageInfo }>;
  readonly assert: (
    assertion: string,
    signal: AbortSignal,
  ) => Promise<{ readonly pass: boolean; readonly reason: string | null }>;
  readonly metrics: () => MidsceneUsageMetrics;
  readonly destroy: () => Promise<void>;
}

export interface LoadedPreviewMidsceneRuntime {
  readonly defineActions: DefineMidsceneActions;
  readonly createAgent: (
    device: AbstractInterface,
    modelConfig: Readonly<Record<string, string>>,
  ) => PreviewMidsceneAgentHandle;
}

export class PreviewMidsceneRuntime extends Context.Service<
  PreviewMidsceneRuntime,
  {
    readonly load: (
      operation: PreviewMidsceneOperation,
    ) => Effect.Effect<LoadedPreviewMidsceneRuntime, PreviewMidsceneRuntimeUnavailableError>;
  }
>()("t3/mcp/preview-midscene/PreviewMidsceneRuntime") {}

interface MidsceneModules {
  readonly Agent: typeof MidsceneAgent;
  readonly defineActionsFromInputPrimitives: (
    input: InputPrimitives,
  ) => ReadonlyArray<import("@midscene/core/device").DeviceAction>;
  readonly getModelRuntime: typeof import("@midscene/core/ai-model").getModelRuntime;
}

type MidsceneAssertionAgent = Pick<MidsceneAgent, "modelConfigManager" | "taskExecutor">;

export const runMidsceneAssertion = async (
  agent: MidsceneAssertionAgent,
  getModelRuntime: MidsceneModules["getModelRuntime"],
  assertion: string,
  signal: AbortSignal,
): Promise<{ readonly pass: boolean; readonly reason: string | null }> => {
  const model = getModelRuntime(agent.modelConfigManager.getModelConfig("insight"));
  // Midscene's Assert task converts an ordinary false result into TaskExecutionError.
  // Boolean preserves false as data while still rejecting model and transport failures.
  const { output, thought } = await agent.taskExecutor.createTypeQueryExecution<boolean>(
    "Boolean",
    `whether the following statement is true: ${assertion}`,
    model,
    { domIncluded: false, screenshotIncluded: true },
    undefined,
    { abortSignal: signal },
  );
  return { pass: Boolean(output), reason: thought ?? null };
};

const loadModules = async (): Promise<MidsceneModules> => {
  const [agentModule, deviceModule, modelModule] = await Promise.all([
    import("@midscene/core/agent"),
    import("@midscene/core/device"),
    import("@midscene/core/ai-model"),
  ]);
  return {
    Agent: agentModule.Agent,
    defineActionsFromInputPrimitives: deviceModule.defineActionsFromInputPrimitives,
    getModelRuntime: modelModule.getModelRuntime,
  };
};

export const make = Effect.sync(() => {
  let modulesPromise: Promise<MidsceneModules> | undefined;

  const load: PreviewMidsceneRuntime["Service"]["load"] = Effect.fn("PreviewMidsceneRuntime.load")(
    function* (operation) {
      const modules = yield* Effect.tryPromise({
        try: () => (modulesPromise ??= loadModules()),
        catch: () => new PreviewMidsceneRuntimeUnavailableError({ operation }),
      });
      return {
        defineActions: modules.defineActionsFromInputPrimitives,
        createAgent: (device, modelConfig) => {
          const agent = new modules.Agent(device, {
            generateReport: false,
            persistExecutionDump: false,
            autoPrintReportMsg: false,
            cache: false,
            modelConfig,
          });
          return {
            act: (instruction, options) =>
              agent.aiAct(instruction, {
                abortSignal: options.signal,
                ...(options.deepThink === undefined ? {} : { deepThink: options.deepThink }),
                ...(options.deepLocate === undefined ? {} : { deepLocate: options.deepLocate }),
              }),
            query: async (demand, signal) => {
              const context = await agent.getUIContext();
              const model = modules.getModelRuntime(
                agent.modelConfigManager.getModelConfig("insight"),
              );
              const result = await agent.service.extract<unknown>(
                demand,
                model,
                { domIncluded: false, screenshotIncluded: true },
                undefined,
                undefined,
                context,
                { abortSignal: signal },
              );
              return {
                value: result.data,
                ...(result.usage === undefined ? {} : { usage: result.usage }),
              };
            },
            assert: (assertion, signal) =>
              runMidsceneAssertion(agent, modules.getModelRuntime, assertion, signal),
            metrics: () => agent.metrics,
            destroy: () => agent.destroy(),
          };
        },
      } satisfies LoadedPreviewMidsceneRuntime;
    },
  );

  return PreviewMidsceneRuntime.of({ load });
});

export const layer = Layer.effect(PreviewMidsceneRuntime, make);
