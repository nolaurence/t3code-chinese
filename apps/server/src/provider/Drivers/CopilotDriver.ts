import type { ModelInfo } from "@github/copilot-sdk";
import {
  CopilotSettings,
  ProviderDriverKind,
  type ServerProvider,
  type ServerProviderModel,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

import { ServerConfig } from "../../config.ts";
import { makeCopilotTextGeneration } from "../../textGeneration/CopilotTextGeneration.ts";
import { makeCopilotAdapter } from "../Layers/CopilotAdapter.ts";
import { makeCopilotRuntime } from "../copilotRuntime.ts";
import { ProviderDriverError } from "../Errors.ts";
import {
  defaultProviderContinuationIdentity,
  type ProviderDriver,
  type ProviderInstance,
} from "../ProviderDriver.ts";
import { mergeProviderInstanceEnvironment } from "../ProviderInstanceEnvironment.ts";
import { makeManualOnlyProviderMaintenanceCapabilities } from "../providerMaintenance.ts";
import { makeManagedServerProvider } from "../makeManagedServerProvider.ts";

const DRIVER_KIND = ProviderDriverKind.make("githubCopilot");
const decodeCopilotSettings = Schema.decodeSync(CopilotSettings);
const maintenanceCapabilities = makeManualOnlyProviderMaintenanceCapabilities({
  provider: DRIVER_KIND,
  packageName: null,
});

export type CopilotDriverEnv = ServerConfig;

function titleCase(value: string): string {
  return value
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function modelFromSdk(model: ModelInfo): ServerProviderModel {
  const efforts = model.supportedReasoningEfforts ?? [];
  const optionDescriptors =
    efforts.length > 0
      ? [
          {
            id: "reasoningEffort",
            label: "Reasoning effort",
            description: "Controls how much reasoning the model uses.",
            type: "select" as const,
            options: efforts.map((effort) => ({
              id: effort,
              label: titleCase(effort),
              ...(effort === model.defaultReasoningEffort ? { isDefault: true } : {}),
            })),
            ...(model.defaultReasoningEffort ? { currentValue: model.defaultReasoningEffort } : {}),
          },
        ]
      : undefined;
  return {
    slug: model.id,
    name: model.name,
    isCustom: false,
    capabilities: optionDescriptors ? { optionDescriptors } : null,
  };
}

function modelFromCustom(model: string): ServerProviderModel {
  return {
    slug: model,
    name: model,
    isCustom: true,
    capabilities: null,
  };
}

function mergeModels(models: ReadonlyArray<ModelInfo>, customModels: ReadonlyArray<string>) {
  const merged = new Map<string, ServerProviderModel>();
  for (const model of models) {
    if (!model.policy || model.policy.state === "enabled") {
      merged.set(model.id, modelFromSdk(model));
    }
  }
  for (const model of customModels) {
    if (!merged.has(model)) merged.set(model, modelFromCustom(model));
  }
  return [...merged.values()];
}

function baseSnapshot(input: {
  readonly instanceId: ProviderInstance["instanceId"];
  readonly displayName: string | undefined;
  readonly accentColor: string | undefined;
  readonly continuationKey: string;
  readonly enabled: boolean;
  readonly customModels: ReadonlyArray<string>;
}): ServerProvider {
  return {
    instanceId: input.instanceId,
    driver: DRIVER_KIND,
    ...(input.displayName ? { displayName: input.displayName } : {}),
    ...(input.accentColor ? { accentColor: input.accentColor } : {}),
    continuation: { groupKey: input.continuationKey },
    badgeLabel: "SDK",
    showInteractionModeToggle: true,
    requiresNewThreadForModelChange: false,
    enabled: input.enabled,
    installed: true,
    version: null,
    status: input.enabled ? "warning" : "disabled",
    auth: { status: "unknown" },
    checkedAt: new Date().toISOString(),
    message: input.enabled
      ? "Checking bundled GitHub Copilot SDK runtime..."
      : "GitHub Copilot is disabled.",
    availability: "available",
    models: input.customModels.map(modelFromCustom),
    slashCommands: [],
    skills: [],
  };
}

export const CopilotDriver: ProviderDriver<CopilotSettings, CopilotDriverEnv> = {
  driverKind: DRIVER_KIND,
  metadata: {
    displayName: "GitHub Copilot",
    supportsMultipleInstances: true,
  },
  configSchema: CopilotSettings,
  defaultConfig: (): CopilotSettings => decodeCopilotSettings({}),
  create: ({ instanceId, displayName, accentColor, environment, enabled, config }) =>
    Effect.gen(function* () {
      const serverConfig = yield* ServerConfig;
      const effectiveConfig = { ...config, enabled } satisfies CopilotSettings;
      const continuationIdentity = defaultProviderContinuationIdentity({
        driverKind: DRIVER_KIND,
        instanceId,
      });
      const initialSnapshot = baseSnapshot({
        instanceId,
        displayName,
        accentColor,
        continuationKey: continuationIdentity.continuationKey,
        enabled,
        customModels: effectiveConfig.customModels,
      });
      const runtime = makeCopilotRuntime({
        instanceId,
        stateDir: serverConfig.stateDir,
        environment: mergeProviderInstanceEnvironment(environment),
      });
      const adapter = yield* makeCopilotAdapter(runtime, {
        instanceId,
        attachmentsDir: serverConfig.attachmentsDir,
      });
      const textGeneration = makeCopilotTextGeneration(runtime);

      const probe = Effect.tryPromise({
        try: async () => {
          if (!effectiveConfig.enabled) return initialSnapshot;
          const auth = await runtime.getAuthStatus();
          if (!auth.isAuthenticated) {
            return {
              ...initialSnapshot,
              status: "warning" as const,
              auth: {
                status: "unauthenticated" as const,
                ...(auth.authType ? { type: auth.authType } : {}),
              },
              checkedAt: new Date().toISOString(),
              message:
                auth.statusMessage ??
                "Set COPILOT_GITHUB_TOKEN, GH_TOKEN, or GITHUB_TOKEN in this provider instance.",
            };
          }
          const models = await runtime.listModels();
          return {
            ...initialSnapshot,
            status: "ready" as const,
            auth: {
              status: "authenticated" as const,
              ...(auth.authType ? { type: auth.authType } : {}),
              ...(auth.login ? { label: auth.login } : {}),
            },
            checkedAt: new Date().toISOString(),
            message: "GitHub Copilot SDK is ready.",
            models: mergeModels(models, effectiveConfig.customModels),
          };
        },
        catch: (cause) => cause,
      }).pipe(
        Effect.match({
          onFailure: (cause): ServerProvider => ({
            ...initialSnapshot,
            status: "error",
            auth: { status: "unknown" },
            checkedAt: new Date().toISOString(),
            message: cause instanceof Error ? cause.message : String(cause),
          }),
          onSuccess: (snapshot) => snapshot,
        }),
      );

      const snapshot = yield* makeManagedServerProvider<CopilotSettings>({
        maintenanceCapabilities,
        getSettings: Effect.succeed(effectiveConfig),
        streamSettings: Stream.empty,
        haveSettingsChanged: () => false,
        initialSnapshot: () => Effect.succeed(initialSnapshot),
        checkProvider: probe,
        refreshInterval: "5 minutes",
      }).pipe(
        Effect.mapError(
          (cause) =>
            new ProviderDriverError({
              driver: DRIVER_KIND,
              instanceId,
              detail: `Failed to build GitHub Copilot snapshot: ${cause.message ?? String(cause)}`,
              cause,
            }),
        ),
      );

      yield* Effect.addFinalizer(() =>
        adapter.stopAll().pipe(
          Effect.tapError((cause) =>
            Effect.logWarning("Failed to stop GitHub Copilot sessions", cause),
          ),
          Effect.ignore,
          Effect.ensuring(
            Effect.tryPromise({
              try: () => runtime.close(),
              catch: (cause) => cause,
            }).pipe(
              Effect.tapError((cause) =>
                Effect.logWarning("Failed to stop GitHub Copilot SDK runtime", cause),
              ),
              Effect.ignore,
            ),
          ),
        ),
      );

      return {
        instanceId,
        driverKind: DRIVER_KIND,
        continuationIdentity,
        displayName,
        accentColor,
        enabled,
        snapshot,
        adapter,
        textGeneration,
      } satisfies ProviderInstance;
    }),
};
