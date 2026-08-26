// @effect-diagnostics nodeBuiltinImport:off
import * as NodePath from "node:path";

import {
  CopilotClient,
  type CopilotSession,
  type GetAuthStatusResponse,
  type ModelInfo,
  type ResumeSessionConfig,
  type SessionConfig,
} from "@github/copilot-sdk";
import type { ProviderInstanceId } from "@t3tools/contracts";

const TOKEN_ENVIRONMENT_VARIABLES = ["COPILOT_GITHUB_TOKEN", "GH_TOKEN", "GITHUB_TOKEN"] as const;

export interface CopilotRuntime {
  readonly ensureStarted: () => Promise<CopilotClient>;
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

export function makeCopilotRuntime(input: {
  readonly instanceId: ProviderInstanceId;
  readonly stateDir: string;
  readonly environment: NodeJS.ProcessEnv;
}): CopilotRuntime {
  const gitHubToken = resolveGitHubToken(input.environment);
  const client = new CopilotClient({
    mode: "copilot-cli",
    baseDirectory: NodePath.join(input.stateDir, "copilot-sdk", input.instanceId),
    env: input.environment,
    ...(gitHubToken ? { gitHubToken } : {}),
    useLoggedInUser: false,
    logLevel: "error",
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
    ensureStarted,
    getAuthStatus: async () => (await ensureStarted()).getAuthStatus(),
    listModels: async () => (await ensureStarted()).listModels(),
    createSession: async (config) => (await ensureStarted()).createSession(config),
    resumeSession: async (sessionId, config) =>
      (await ensureStarted()).resumeSession(sessionId, config),
    close,
  };
}
