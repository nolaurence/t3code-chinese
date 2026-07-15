import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { CallToolResult, Progress, Tool } from "@modelcontextprotocol/sdk/types.js";

import { T3_CODE_BROWSER_TOOL_INSTRUCTIONS } from "./browserInstructions.ts";
import { T3_MCP_BEARER_TOKEN_ENV, T3_MCP_ENDPOINT_ENV } from "./contract.ts";

const CLIENT_NAME = "t3-code-pi";
const CLIENT_VERSION = "1.0.0";
const CONNECT_TIMEOUT_MS = 15_000;
const TOOL_REQUEST_TIMEOUT_MS = 330_000;
const MAX_TOOL_PAGES = 100;

type PiTextContent = { readonly type: "text"; readonly text: string };
type PiImageContent = {
  readonly type: "image";
  readonly data: string;
  readonly mimeType: string;
};
type PiContent = PiTextContent | PiImageContent;

interface PiToolResult {
  readonly content: ReadonlyArray<PiContent>;
  readonly details?: unknown;
}

interface PiToolUpdateCallback {
  (result: PiToolResult): void;
}

interface PiToolDefinition {
  readonly name: string;
  readonly label: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
  readonly executionMode: "sequential";
  readonly execute: (
    toolCallId: string,
    params: Record<string, unknown>,
    signal: AbortSignal | undefined,
    onUpdate: PiToolUpdateCallback | undefined,
  ) => Promise<PiToolResult>;
}

export interface PiExtensionApi {
  readonly registerTool: (tool: PiToolDefinition) => void;
  readonly on: (
    event: "before_agent_start" | "session_shutdown",
    handler: (event: {
      readonly systemPrompt?: string;
    }) =>
      | Promise<{ readonly systemPrompt?: string } | void>
      | { readonly systemPrompt?: string }
      | void,
  ) => void;
}

export interface T3McpExtensionConfig {
  readonly endpoint: string;
  readonly bearerToken: string;
}

export interface T3McpProgress {
  readonly progress: number;
  readonly total?: number | undefined;
  readonly message?: string | undefined;
}

export interface T3McpConnection {
  readonly listTools: (
    cursor?: string,
  ) => Promise<{ readonly tools: ReadonlyArray<Tool>; readonly nextCursor?: string }>;
  readonly callTool: (
    name: string,
    args: Record<string, unknown>,
    options: {
      readonly signal?: AbortSignal;
      readonly onProgress?: (progress: T3McpProgress) => void;
    },
  ) => Promise<CallToolResult>;
  readonly close: () => Promise<void>;
}

export type ConnectT3Mcp = (config: T3McpExtensionConfig) => Promise<T3McpConnection>;

export interface T3McpPiExtensionOptions {
  readonly environment?: Readonly<Record<string, string | undefined>>;
  readonly connect?: ConnectT3Mcp;
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function readT3McpExtensionConfig(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): T3McpExtensionConfig {
  const endpoint = environment[T3_MCP_ENDPOINT_ENV]?.trim();
  const bearerToken = environment[T3_MCP_BEARER_TOKEN_ENV]?.trim();
  if (!endpoint || !bearerToken) {
    throw new Error(
      `T3 Pi MCP extension requires ${T3_MCP_ENDPOINT_ENV} and ${T3_MCP_BEARER_TOKEN_ENV}.`,
    );
  }

  let parsedEndpoint: URL;
  try {
    parsedEndpoint = new URL(endpoint);
  } catch (cause) {
    throw new Error(`T3 Pi MCP extension received an invalid ${T3_MCP_ENDPOINT_ENV}.`, { cause });
  }
  if (parsedEndpoint.protocol !== "http:" && parsedEndpoint.protocol !== "https:") {
    throw new Error(`T3 Pi MCP extension requires an HTTP(S) ${T3_MCP_ENDPOINT_ENV}.`);
  }

  return { endpoint: parsedEndpoint.toString(), bearerToken };
}

export const connectT3Mcp: ConnectT3Mcp = async (config) => {
  const transport = new StreamableHTTPClientTransport(new URL(config.endpoint), {
    requestInit: {
      headers: {
        Authorization: `Bearer ${config.bearerToken}`,
      },
    },
  });
  const client = new Client({ name: CLIENT_NAME, version: CLIENT_VERSION });

  try {
    await client.connect(transport as unknown as Transport, { timeout: CONNECT_TIMEOUT_MS });
  } catch (cause) {
    await client.close().catch(() => undefined);
    throw new Error(`T3 Pi MCP extension failed to connect: ${errorMessage(cause)}`, { cause });
  }

  return {
    listTools: async (cursor) => {
      const result = await client.listTools(cursor ? { cursor } : undefined, {
        timeout: CONNECT_TIMEOUT_MS,
      });
      return {
        tools: result.tools,
        ...(result.nextCursor ? { nextCursor: result.nextCursor } : {}),
      };
    },
    callTool: async (name, args, options) => {
      const onprogress = options.onProgress
        ? (progress: Progress) =>
            options.onProgress?.({
              progress: progress.progress,
              ...(progress.total === undefined ? {} : { total: progress.total }),
              ...(progress.message === undefined ? {} : { message: progress.message }),
            })
        : undefined;
      return (await client.callTool({ name, arguments: args }, undefined, {
        ...(options.signal ? { signal: options.signal } : {}),
        ...(onprogress ? { onprogress } : {}),
        timeout: TOOL_REQUEST_TIMEOUT_MS,
        maxTotalTimeout: TOOL_REQUEST_TIMEOUT_MS,
        resetTimeoutOnProgress: true,
      })) as CallToolResult;
    },
    close: async () => {
      await transport.terminateSession().catch(() => undefined);
      await client.close().catch(() => undefined);
    },
  };
};

function normalizeInputSchema(schema: Tool["inputSchema"]): Record<string, unknown> {
  const { $schema: _schema, additionalProperties: _additionalProperties, ...normalized } = schema;
  return normalized;
}

async function listPreviewTools(connection: T3McpConnection): Promise<ReadonlyArray<Tool>> {
  const tools = new Map<string, Tool>();
  const cursors = new Set<string>();
  let cursor: string | undefined;

  for (let page = 0; page < MAX_TOOL_PAGES; page += 1) {
    const result = await connection.listTools(cursor);
    for (const tool of result.tools) {
      if (!tool.name.startsWith("preview_")) continue;
      if (tools.has(tool.name)) {
        throw new Error(`T3 Pi MCP extension received duplicate tool '${tool.name}'.`);
      }
      tools.set(tool.name, tool);
    }

    cursor = result.nextCursor;
    if (!cursor) return [...tools.values()];
    if (cursors.has(cursor)) {
      throw new Error("T3 Pi MCP extension received a repeated tools/list cursor.");
    }
    cursors.add(cursor);
  }

  throw new Error(`T3 Pi MCP extension exceeded ${MAX_TOOL_PAGES} tools/list pages.`);
}

function stringifyStructuredContent(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function toPiContent(result: CallToolResult): ReadonlyArray<PiContent> {
  const content = result.content.flatMap((block): ReadonlyArray<PiContent> => {
    if (block.type === "text") return [{ type: "text", text: block.text }];
    if (block.type === "image") {
      return [{ type: "image", data: block.data, mimeType: block.mimeType }];
    }
    if (block.type === "resource" && "text" in block.resource) {
      return [{ type: "text", text: block.resource.text }];
    }
    return [];
  });
  if (content.length > 0) return content;

  const structured = stringifyStructuredContent(result.structuredContent);
  return [{ type: "text", text: structured ?? "T3 preview tool completed successfully." }];
}

function toolFailureMessage(name: string, result: CallToolResult): string {
  const text = toPiContent(result)
    .filter((content): content is PiTextContent => content.type === "text")
    .map((content) => content.text.trim())
    .filter(Boolean)
    .join("\n");
  return text || `T3 preview tool '${name}' failed.`;
}

function progressText(progress: T3McpProgress): string {
  if (progress.message?.trim()) return progress.message.trim();
  return progress.total === undefined
    ? `T3 preview tool progress: ${String(progress.progress)}`
    : `T3 preview tool progress: ${String(progress.progress)}/${String(progress.total)}`;
}

export function makeT3McpPiExtension(options: T3McpPiExtensionOptions = {}) {
  const environment = options.environment ?? process.env;
  const connect = options.connect ?? connectT3Mcp;

  return async function t3McpPiExtension(pi: PiExtensionApi): Promise<void> {
    const config = readT3McpExtensionConfig(environment);
    let connection: T3McpConnection | undefined;
    let connecting: Promise<T3McpConnection> | undefined;
    let shuttingDown = false;

    const closeConnection = async () => {
      const current = connection;
      connection = undefined;
      connecting = undefined;
      if (current) await current.close();
    };

    const getConnection = async (): Promise<T3McpConnection> => {
      if (shuttingDown) throw new Error("T3 Pi MCP extension is shutting down.");
      if (connection) return connection;
      if (!connecting) {
        connecting = connect(config).then(
          async (connected) => {
            if (shuttingDown) {
              await connected.close();
              throw new Error("T3 Pi MCP extension shut down while connecting.");
            }
            connection = connected;
            connecting = undefined;
            return connected;
          },
          (cause) => {
            connecting = undefined;
            throw cause;
          },
        );
      }
      return connecting;
    };

    const initialConnection = await getConnection();
    let tools: ReadonlyArray<Tool>;
    try {
      tools = await listPreviewTools(initialConnection);
    } catch (cause) {
      await closeConnection();
      throw cause;
    }
    if (tools.length === 0) {
      await closeConnection();
      throw new Error("T3 Pi MCP extension did not discover any preview_* tools.");
    }

    for (const tool of tools) {
      pi.registerTool({
        name: tool.name,
        label: tool.annotations?.title?.trim() || tool.name,
        description: tool.description?.trim() || `T3 preview tool: ${tool.name}`,
        parameters: normalizeInputSchema(tool.inputSchema),
        executionMode: "sequential",
        execute: async (_toolCallId, params, signal, onUpdate) => {
          const activeConnection = await getConnection();
          let result: CallToolResult;
          try {
            result = await activeConnection.callTool(tool.name, params, {
              ...(signal ? { signal } : {}),
              ...(onUpdate
                ? {
                    onProgress: (progress) =>
                      onUpdate({
                        content: [{ type: "text", text: progressText(progress) }],
                        details: { toolName: tool.name, progress },
                      }),
                  }
                : {}),
            });
          } catch (cause) {
            if (!signal?.aborted) await closeConnection();
            throw cause;
          }
          if (result.isError === true) {
            throw new Error(toolFailureMessage(tool.name, result));
          }
          return {
            content: toPiContent(result),
            details: {
              toolName: tool.name,
              ...(result.structuredContent === undefined
                ? {}
                : { structuredContent: result.structuredContent }),
            },
          };
        },
      });
    }

    pi.on("before_agent_start", (event) => ({
      systemPrompt: `${event.systemPrompt ?? ""}${T3_CODE_BROWSER_TOOL_INSTRUCTIONS}`,
    }));
    pi.on("session_shutdown", () => {
      shuttingDown = true;
      return closeConnection();
    });
  };
}

export default makeT3McpPiExtension();
