// @effect-diagnostics nodeBuiltinImport:off
// @effect-diagnostics globalFetch:off - Copilot SDK model discovery requires a Promise-based callback.
import * as NodeFS from "node:fs";
import * as NodeModule from "node:module";
import * as NodePath from "node:path";

import {
  CopilotClient,
  type CopilotSession,
  type GetAuthStatusResponse,
  type ModelInfo,
  type ProviderConfig,
  type ResumeSessionConfig,
  type SessionConfig,
} from "@github/copilot-sdk";
import type {
  CopilotLlmProvider,
  CopilotLlmProviderModel,
  CopilotModelConfiguration,
  CopilotModelConfigurations,
  CopilotSettings,
  ProviderInstanceId,
} from "@t3tools/contracts";
import { parseCopilotLlmModelSlug } from "@t3tools/contracts";

const TOKEN_ENVIRONMENT_VARIABLES = ["COPILOT_GITHUB_TOKEN", "GH_TOKEN", "GITHUB_TOKEN"] as const;
const PROVIDER_TYPES = ["openai", "azure", "anthropic"] as const;
const WIRE_APIS = ["completions", "responses"] as const;
const DEFAULT_CONTEXT_WINDOW_TOKENS = 128_000;

const REASONING_EFFORT_VALUES: ReadonlySet<string> = new Set([
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);
type CopilotEffort = NonNullable<ModelInfo["defaultReasoningEffort"]>;

/**
 * Reasoning-effort metadata for models the provider does not describe itself.
 * BYOK gateways rarely report effort levels and the Copilot catalog is
 * unreachable without GitHub auth, so known ids get their picker options from
 * this table. Unknown models stay without an effort selector — sending an
 * unsupported effort would fail the turn.
 */
export const KNOWN_MODEL_REASONING_EFFORTS: Readonly<Record<string, ReadonlyArray<CopilotEffort>>> =
  {
    "gpt-5.4": ["low", "medium", "high", "xhigh"],
    "gpt-5.5": ["low", "medium", "high", "xhigh"],
    "gpt-5.6-sol": ["low", "medium", "high", "xhigh", "max"],
    "gpt-5.6-luna": ["low", "medium", "high", "xhigh", "max"],
    "gpt-5.6-terra": ["low", "medium", "high", "xhigh", "max"],
    k3: ["low", "high", "max"],
    "k3-256k": ["low", "high", "max"],
  };

export function knownModelReasoningEfforts(
  modelId: string,
): ReadonlyArray<CopilotEffort> | undefined {
  return KNOWN_MODEL_REASONING_EFFORTS[modelId.trim().toLowerCase()];
}

export interface CopilotRuntime {
  /** Legacy BYOK provider applied to unscoped models, or undefined for GitHub Copilot auth. */
  readonly sessionProvider: ProviderConfig | undefined;
  readonly resolveModel: (model: string | undefined) => CopilotResolvedModel;
  readonly ensureStarted: () => Promise<CopilotClient>;
  readonly ping: () => Promise<void>;
  readonly getAuthStatus: () => Promise<GetAuthStatusResponse>;
  readonly listModels: () => Promise<ModelInfo[]>;
  readonly createSession: (config: SessionConfig) => Promise<CopilotSession>;
  readonly resumeSession: (
    sessionId: string,
    config: ResumeSessionConfig,
  ) => Promise<CopilotSession>;
  readonly close: () => Promise<void>;
}

export interface CopilotResolvedModel {
  readonly selectionModel: string | undefined;
  readonly sdkModel: string | undefined;
  readonly provider: ProviderConfig | undefined;
  readonly providerId: string | undefined;
  readonly configuration: CopilotModelConfiguration | undefined;
}

function resolveGitHubToken(environment: NodeJS.ProcessEnv): string | undefined {
  for (const name of TOKEN_ENVIRONMENT_VARIABLES) {
    const value = environment[name]?.trim();
    if (value) {
      return value;
    }
  }
  return undefined;
}

function parseProviderType(value: string): ProviderConfig["type"] | undefined {
  const normalized = value.trim().toLowerCase();
  return (PROVIDER_TYPES as ReadonlyArray<string>).includes(normalized)
    ? (normalized as ProviderConfig["type"])
    : undefined;
}

function parseWireApi(value: string): ProviderConfig["wireApi"] | undefined {
  const normalized = value.trim().toLowerCase();
  return (WIRE_APIS as ReadonlyArray<string>).includes(normalized)
    ? (normalized as ProviderConfig["wireApi"])
    : undefined;
}

/**
 * Builds the BYOK provider applied to every session of this instance. Returns
 * undefined when no base URL is configured, in which case sessions use GitHub
 * Copilot auth instead.
 */
export function resolveCopilotSessionProvider(
  config: Pick<
    CopilotSettings,
    "baseUrl" | "providerType" | "apiKey" | "wireApi" | "azureApiVersion"
  >,
): ProviderConfig | undefined {
  const baseUrl = config.baseUrl.trim();
  if (!baseUrl) {
    return undefined;
  }

  const type = parseProviderType(config.providerType);
  const wireApi = parseWireApi(config.wireApi);
  const apiKey = config.apiKey.trim() || undefined;
  const azureApiVersion = config.azureApiVersion.trim() || undefined;
  return {
    ...(type ? { type } : {}),
    baseUrl,
    ...(apiKey ? { apiKey } : {}),
    // wireApi only applies to openai/azure; anthropic has a single API shape.
    ...(type !== "anthropic" && wireApi ? { wireApi } : {}),
    ...(type === "azure" && azureApiVersion ? { azure: { apiVersion: azureApiVersion } } : {}),
    ...((type ?? "openai") === "openai" ? { headers: { "User-Agent": "t3code" } } : {}),
  };
}

export function resolveCopilotLlmProvider(provider: CopilotLlmProvider): ProviderConfig {
  const type = parseProviderType(provider.type);
  const wireApi = parseWireApi(provider.wireApi);
  const apiKey = provider.apiKey.trim() || undefined;
  const azureApiVersion = provider.azureApiVersion.trim() || undefined;
  return {
    ...(type ? { type } : {}),
    baseUrl: provider.baseUrl.trim(),
    ...(apiKey ? { apiKey } : {}),
    ...(type !== "anthropic" && wireApi ? { wireApi } : {}),
    ...(type === "azure" && azureApiVersion ? { azure: { apiVersion: azureApiVersion } } : {}),
    ...(type === "openai" ? { headers: { "User-Agent": "t3code" } } : {}),
  };
}

function modelsEndpoint(provider: ProviderConfig): URL {
  const baseUrl = provider.baseUrl.replace(/\/+$/, "");
  const url = new URL(baseUrl.endsWith("/models") ? baseUrl : `${baseUrl}/models`);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Model provider URL must use HTTP or HTTPS.");
  }
  if (provider.type === "azure" && provider.azure?.apiVersion) {
    url.searchParams.set("api-version", provider.azure.apiVersion);
  }
  return url;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  const candidate =
    typeof value === "string" && value.trim().length > 0 ? Number(value.trim()) : value;
  return typeof candidate === "number" && Number.isSafeInteger(candidate) && candidate > 0
    ? candidate
    : undefined;
}

function normalizeReasoningEffortList(value: unknown): CopilotEffort[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return [
    ...new Set(
      value.filter(
        (entry): entry is CopilotEffort =>
          typeof entry === "string" && REASONING_EFFORT_VALUES.has(entry),
      ),
    ),
  ];
}

function apiModelToSdk(
  value: unknown,
  configurations: CopilotModelConfigurations,
): ModelInfo | undefined {
  const model = asRecord(value);
  const id =
    typeof value === "string" ? value.trim() : typeof model?.id === "string" ? model.id.trim() : "";
  if (!id) {
    return undefined;
  }
  const configured: CopilotModelConfiguration | undefined = configurations[id];
  const apiCapabilities = asRecord(model?.capabilities);
  const apiSupports = asRecord(apiCapabilities?.supports);
  const apiLimits = asRecord(apiCapabilities?.limits);
  const apiContextWindow =
    positiveInteger(model?.contextWindowTokens) ??
    positiveInteger(model?.context_window) ??
    positiveInteger(model?.contextWindow) ??
    positiveInteger(model?.context_length) ??
    positiveInteger(model?.contextLength) ??
    positiveInteger(model?.max_context_window_tokens) ??
    positiveInteger(model?.maxContextWindowTokens) ??
    positiveInteger(apiCapabilities?.contextWindowTokens) ??
    positiveInteger(apiCapabilities?.max_context_window_tokens) ??
    positiveInteger(apiCapabilities?.maxContextWindowTokens) ??
    positiveInteger(apiLimits?.contextWindowTokens) ??
    positiveInteger(apiLimits?.context_window) ??
    positiveInteger(apiLimits?.contextWindow) ??
    positiveInteger(apiLimits?.context_length) ??
    positiveInteger(apiLimits?.contextLength) ??
    positiveInteger(apiLimits?.max_context_window_tokens) ??
    positiveInteger(apiLimits?.maxContextWindowTokens);
  const contextWindow =
    configured?.contextWindowTokens ?? apiContextWindow ?? DEFAULT_CONTEXT_WINDOW_TOKENS;
  const apiEfforts = normalizeReasoningEffortList(
    model?.supportedReasoningEfforts ??
      model?.supported_reasoning_efforts ??
      model?.reasoningEfforts ??
      model?.reasoning_efforts ??
      apiCapabilities?.supportedReasoningEfforts ??
      apiCapabilities?.supported_reasoning_efforts ??
      apiCapabilities?.reasoningEffort ??
      apiCapabilities?.reasoning_effort ??
      apiSupports?.reasoningEffort ??
      apiSupports?.reasoning_effort,
  );
  const reasoningEfforts =
    configured?.reasoningEfforts ??
    (apiEfforts && apiEfforts.length > 0 ? apiEfforts : undefined) ??
    knownModelReasoningEfforts(id) ??
    [];
  const apiDefaultEffort =
    model?.defaultReasoningEffort ??
    model?.default_reasoning_effort ??
    apiCapabilities?.defaultReasoningEffort ??
    apiCapabilities?.default_reasoning_effort;
  const defaultReasoningEffort =
    configured?.defaultReasoningEffort ??
    (typeof apiDefaultEffort === "string" &&
    reasoningEfforts.includes(apiDefaultEffort as CopilotEffort)
      ? (apiDefaultEffort as CopilotEffort)
      : undefined);
  const nameValue =
    configured?.displayName ??
    (typeof model?.name === "string"
      ? model.name
      : typeof model?.display_name === "string"
        ? model.display_name
        : typeof model?.displayName === "string"
          ? model.displayName
          : id);
  const name = nameValue.trim() || id;
  return {
    id,
    name,
    capabilities: {
      supports: {
        vision: false,
        reasoningEffort: reasoningEfforts.length > 0,
      },
      limits: { max_context_window_tokens: contextWindow },
    },
    ...(reasoningEfforts.length > 0 ? { supportedReasoningEfforts: [...reasoningEfforts] } : {}),
    ...(defaultReasoningEffort ? { defaultReasoningEffort } : {}),
  };
}

export async function fetchCopilotProviderModels(
  provider: ProviderConfig,
  configurations: CopilotModelConfigurations,
  fetchImpl: (input: URL, init?: RequestInit) => Promise<Response> = (input, init) =>
    fetch(input, init),
): Promise<ModelInfo[]> {
  const headers = new Headers(provider.headers);
  headers.set("Accept", "application/json");
  if (provider.apiKey) {
    if (provider.type === "anthropic") {
      headers.set("x-api-key", provider.apiKey);
      headers.set("anthropic-version", "2023-06-01");
    } else if (provider.type === "azure") {
      headers.set("api-key", provider.apiKey);
    } else {
      headers.set("Authorization", `Bearer ${provider.apiKey}`);
    }
  }
  const endpoint = modelsEndpoint(provider);
  const response = await fetchImpl(endpoint, { headers, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) {
    const detail = (await response.text()).trim().slice(0, 500);
    throw new Error(
      `Model list request failed (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`,
    );
  }
  const payload: unknown = await response.json();
  const payloadRecord = asRecord(payload);
  const candidates = Array.isArray(payload)
    ? payload
    : Array.isArray(payloadRecord?.data)
      ? payloadRecord.data
      : Array.isArray(payloadRecord?.models)
        ? payloadRecord.models
        : undefined;
  if (!candidates) {
    throw new Error("Model list response must be an array or an object with a data/models array.");
  }
  const models = new Map<string, ModelInfo>();
  for (const candidate of candidates) {
    const model = apiModelToSdk(candidate, configurations);
    if (model && !models.has(model.id)) {
      models.set(model.id, model);
    }
  }
  return [...models.values()];
}

export async function discoverCopilotLlmProviderModels(
  provider: Pick<CopilotLlmProvider, "type" | "baseUrl" | "apiKey" | "azureApiVersion">,
  fetchImpl?: (input: URL, init?: RequestInit) => Promise<Response>,
): Promise<CopilotLlmProviderModel[]> {
  const models = await fetchCopilotProviderModels(
    resolveCopilotLlmProvider({
      id: "model-discovery",
      name: "Model discovery",
      wireApi: "completions",
      models: [],
      ...provider,
    }),
    {},
    fetchImpl,
  );
  return models.map((model) => {
    const contextWindowTokens = model.capabilities.limits.max_context_window_tokens;
    return {
      id: model.id,
      ...(model.name !== model.id ? { displayName: model.name } : {}),
      ...(contextWindowTokens <= 10_000_000 ? { contextWindowTokens } : {}),
      ...(model.supportedReasoningEfforts?.length
        ? { reasoningEfforts: model.supportedReasoningEfforts }
        : {}),
      ...(model.defaultReasoningEffort
        ? { defaultReasoningEffort: model.defaultReasoningEffort }
        : {}),
    };
  });
}

function copilotCliBinaryName(platform: NodeJS.Platform): string {
  return platform === "win32" ? "copilot.exe" : "copilot";
}

function copilotPlatformPackageNames(
  platform: NodeJS.Platform,
  architecture: NodeJS.Architecture,
): ReadonlyArray<string> {
  const platforms = platform === "linux" ? ["linux", "linuxmusl"] : [platform];
  return platforms.map((platformName) => `copilot-${platformName}-${architecture}`);
}

function* candidateCopilotCliPaths(
  platform: NodeJS.Platform,
  architecture: NodeJS.Architecture,
): Generator<string> {
  const binary = copilotCliBinaryName(platform);
  // Module resolution: @github/copilot's optional platform packages sit next
  // to it in node_modules, so anchor at the SDK and walk across.
  try {
    const require = NodeModule.createRequire(import.meta.url);
    const sdkEntry = require.resolve("@github/copilot-sdk");
    const sdkRequire = NodeModule.createRequire(sdkEntry);
    const copilotManifest = sdkRequire.resolve("@github/copilot/package.json");
    const copilotPackageDir = NodePath.dirname(copilotManifest);
    for (const packageName of copilotPlatformPackageNames(platform, architecture)) {
      yield NodePath.join(copilotPackageDir, "..", packageName, binary);
    }
  } catch {
    // Fall through to the packaged-desktop candidates below.
  }
  // Packaged desktop app: the server runs inside an asar archive whose native
  // executables live in the unpacked sibling (app.asar.unpacked, or the
  // server.asar.unpacked sidecar on Windows).
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (resourcesPath) {
    for (const sidecar of ["app.asar.unpacked", "server.asar.unpacked"]) {
      for (const packageName of copilotPlatformPackageNames(platform, architecture)) {
        yield NodePath.join(resourcesPath, sidecar, "node_modules", "@github", packageName, binary);
      }
    }
  }
}

/**
 * Resolves the bundled native Copilot CLI executable. The SDK otherwise spawns
 * its JS loader with process.execPath, which is the Electron binary (not Node)
 * when the server runs inside the desktop app — the loader then exits and every
 * RPC fails with "Connection is closed". Spawning the native binary directly
 * avoids the JS loader entirely.
 */
export function resolveBundledCopilotCliPath(
  platform: NodeJS.Platform,
  architecture: NodeJS.Architecture,
): string | undefined {
  for (const candidate of candidateCopilotCliPaths(platform, architecture)) {
    // Files inside an asar archive are visible to fs but cannot be spawned;
    // only the unpacked sibling works.
    const unpacked = candidate.replace(/\.asar([\\/])/, ".asar.unpacked$1");
    if (unpacked !== candidate) {
      if (NodeFS.existsSync(unpacked)) {
        return unpacked;
      }
      continue;
    }
    if (NodeFS.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

export function makeCopilotRuntime(input: {
  readonly instanceId: ProviderInstanceId;
  readonly stateDir: string;
  readonly environment: NodeJS.ProcessEnv;
  readonly platform: NodeJS.Platform;
  readonly architecture: NodeJS.Architecture;
  readonly sessionProvider?: ProviderConfig | undefined;
  readonly modelConfigurations?: CopilotModelConfigurations | undefined;
  readonly llmProviders?: ReadonlyArray<CopilotLlmProvider> | undefined;
}): CopilotRuntime {
  const gitHubToken = resolveGitHubToken(input.environment);
  const cliPath =
    input.environment.COPILOT_CLI_PATH?.trim() ||
    resolveBundledCopilotCliPath(input.platform, input.architecture);
  const sessionProvider = input.sessionProvider;
  const llmProviders = new Map(
    (input.llmProviders ?? []).map((provider) => [provider.id, provider]),
  );
  const client = new CopilotClient({
    mode: "copilot-cli",
    baseDirectory: NodePath.join(input.stateDir, "copilot-sdk", input.instanceId),
    env: {
      ...input.environment,
      ...(cliPath ? { COPILOT_CLI_PATH: cliPath } : {}),
    },
    ...(gitHubToken ? { gitHubToken } : {}),
    useLoggedInUser: false,
    logLevel: "error",
    ...(sessionProvider
      ? {
          onListModels: () =>
            fetchCopilotProviderModels(sessionProvider, input.modelConfigurations ?? {}),
        }
      : {}),
  });

  let startPromise: Promise<void> | undefined;
  let closed = false;

  const ensureStarted = async (): Promise<CopilotClient> => {
    if (closed) {
      throw new Error("GitHub Copilot SDK runtime is closed.");
    }
    startPromise ??= client.start().catch((cause: unknown) => {
      startPromise = undefined;
      throw cause;
    });
    await startPromise;
    return client;
  };

  const close = async (): Promise<void> => {
    if (closed) {
      return;
    }
    closed = true;
    if (!startPromise) {
      return;
    }

    try {
      await startPromise;
      await client.stop();
    } catch (stopCause) {
      try {
        await client.forceStop();
      } catch (forceStopCause) {
        // eslint-disable-next-line preserve-caught-error -- AggregateError retains both shutdown failures.
        throw new Error("Failed to stop the GitHub Copilot SDK runtime.", {
          cause: new AggregateError([stopCause, forceStopCause]),
        });
      }
    }
  };

  const resolveModel = (model: string | undefined): CopilotResolvedModel => {
    if (!model) {
      return {
        selectionModel: undefined,
        sdkModel: undefined,
        provider: sessionProvider,
        providerId: sessionProvider ? "legacy" : undefined,
        configuration: undefined,
      };
    }
    const scoped = parseCopilotLlmModelSlug(model);
    if (!scoped) {
      return {
        selectionModel: model,
        sdkModel: model,
        provider: sessionProvider,
        providerId: sessionProvider ? "legacy" : undefined,
        configuration: input.modelConfigurations?.[model],
      };
    }
    const provider = llmProviders.get(scoped.providerId);
    if (!provider) {
      throw new Error(`Copilot LLM provider '${scoped.providerId}' is no longer configured.`);
    }
    const configuredModel = provider.models.find((candidate) => candidate.id === scoped.modelId);
    if (!configuredModel) {
      throw new Error(
        `Model '${scoped.modelId}' is no longer configured for Copilot LLM provider '${provider.name}'.`,
      );
    }
    return {
      selectionModel: model,
      sdkModel: scoped.modelId,
      provider: resolveCopilotLlmProvider(provider),
      providerId: provider.id,
      configuration: configuredModel,
    };
  };

  return {
    sessionProvider: input.sessionProvider,
    resolveModel,
    ensureStarted,
    ping: async () => {
      await (await ensureStarted()).ping();
    },
    getAuthStatus: async () => (await ensureStarted()).getAuthStatus(),
    listModels: async () => (await ensureStarted()).listModels(),
    createSession: async (config) => (await ensureStarted()).createSession(config),
    resumeSession: async (sessionId, config) =>
      (await ensureStarted()).resumeSession(sessionId, config),
    close,
  };
}
