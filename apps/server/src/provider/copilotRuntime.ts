// @effect-diagnostics nodeBuiltinImport:off
// @effect-diagnostics globalFetch:off - Copilot SDK model discovery requires a Promise-based callback.
import * as NodeFs from "node:fs";
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
  CopilotModelConfiguration,
  CopilotModelConfigurations,
  CopilotSettings,
  ProviderInstanceId,
} from "@t3tools/contracts";

const TOKEN_ENVIRONMENT_VARIABLES = ["COPILOT_GITHUB_TOKEN", "GH_TOKEN", "GITHUB_TOKEN"] as const;
const PROVIDER_TYPES = ["openai", "azure", "anthropic"] as const;
const WIRE_APIS = ["completions", "responses"] as const;
const DEFAULT_CONTEXT_WINDOW_TOKENS = 128_000;

export interface CopilotRuntime {
  /** BYOK provider applied to every session, or undefined for GitHub Copilot auth. */
  readonly sessionProvider: ProviderConfig | undefined;
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

function modelsEndpoint(provider: ProviderConfig): URL {
  const baseUrl = provider.baseUrl.replace(/\/+$/, "");
  const url = new URL(baseUrl.endsWith("/models") ? baseUrl : `${baseUrl}/models`);
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
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function apiModelToSdk(value: unknown, configurations: CopilotModelConfigurations): ModelInfo {
  const model = asRecord(value);
  const id = typeof model?.id === "string" ? model.id.trim() : "";
  if (!id) {
    throw new Error("Model list response contains an entry without a non-empty id.");
  }
  const configured: CopilotModelConfiguration | undefined = configurations[id];
  const apiContextWindow =
    positiveInteger(model?.context_window) ??
    positiveInteger(model?.context_length) ??
    positiveInteger(model?.max_context_window_tokens);
  const contextWindow =
    configured?.contextWindowTokens ?? apiContextWindow ?? DEFAULT_CONTEXT_WINDOW_TOKENS;
  const reasoningEfforts = configured?.reasoningEfforts ?? [];
  const nameValue =
    typeof model?.name === "string"
      ? model.name
      : typeof model?.display_name === "string"
        ? model.display_name
        : id;
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
    ...(configured?.defaultReasoningEffort
      ? { defaultReasoningEffort: configured.defaultReasoningEffort }
      : {}),
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
  const payload = asRecord(await response.json());
  if (!payload || !Array.isArray(payload.data)) {
    throw new Error("Model list response must be an object with a data array.");
  }
  return payload.data.map((model) => apiModelToSdk(model, configurations));
}

function copilotCliBinaryName(): string {
  return process.platform === "win32" ? "copilot.exe" : "copilot";
}

function copilotPlatformPackageNames(): ReadonlyArray<string> {
  const platforms = process.platform === "linux" ? ["linux", "linuxmusl"] : [process.platform];
  return platforms.map((platform) => `copilot-${platform}-${process.arch}`);
}

function* candidateCopilotCliPaths(): Generator<string> {
  const binary = copilotCliBinaryName();
  // Module resolution: @github/copilot's optional platform packages sit next
  // to it in node_modules, so anchor at the SDK and walk across.
  try {
    const require = NodeModule.createRequire(import.meta.url);
    const sdkEntry = require.resolve("@github/copilot-sdk");
    const sdkRequire = NodeModule.createRequire(sdkEntry);
    const copilotManifest = sdkRequire.resolve("@github/copilot/package.json");
    const copilotPackageDir = NodePath.dirname(copilotManifest);
    for (const packageName of copilotPlatformPackageNames()) {
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
      for (const packageName of copilotPlatformPackageNames()) {
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
export function resolveBundledCopilotCliPath(): string | undefined {
  for (const candidate of candidateCopilotCliPaths()) {
    // Files inside an asar archive are visible to fs but cannot be spawned;
    // only the unpacked sibling works.
    const unpacked = candidate.replace(/\.asar([\\/])/, ".asar.unpacked$1");
    if (unpacked !== candidate) {
      if (NodeFs.existsSync(unpacked)) {
        return unpacked;
      }
      continue;
    }
    if (NodeFs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

export function makeCopilotRuntime(input: {
  readonly instanceId: ProviderInstanceId;
  readonly stateDir: string;
  readonly environment: NodeJS.ProcessEnv;
  readonly sessionProvider?: ProviderConfig | undefined;
  readonly modelConfigurations?: CopilotModelConfigurations | undefined;
}): CopilotRuntime {
  const gitHubToken = resolveGitHubToken(input.environment);
  const cliPath = input.environment.COPILOT_CLI_PATH?.trim() || resolveBundledCopilotCliPath();
  const sessionProvider = input.sessionProvider;
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

  return {
    sessionProvider: input.sessionProvider,
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
