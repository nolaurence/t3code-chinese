import { describe, expect, it } from "@effect/vitest";
import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";

import { T3_MCP_BEARER_TOKEN_ENV, T3_MCP_ENDPOINT_ENV } from "./bundled-pi-extension/contract.ts";
import {
  makeT3McpPiExtension,
  type PiExtensionApi,
  type T3McpConnection,
} from "./bundled-pi-extension/index.ts";

type ExtensionHandler = Parameters<PiExtensionApi["on"]>[1];
type RegisteredTool = Parameters<PiExtensionApi["registerTool"]>[0];

function makePiHarness() {
  const tools: RegisteredTool[] = [];
  const handlers = new Map<string, ExtensionHandler[]>();
  const pi: PiExtensionApi = {
    registerTool: (tool) => {
      tools.push(tool);
    },
    on: (event, handler) => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
  };
  return { pi, tools, handlers };
}

function previewTool(
  name: string,
  options: {
    readonly title?: string;
    readonly schema?: Tool["inputSchema"];
  } = {},
): Tool {
  return {
    name,
    description: `Description for ${name}`,
    inputSchema: options.schema ?? { type: "object", properties: {} },
    ...(options.title ? { annotations: { title: options.title } } : {}),
  };
}

describe("bundled Pi MCP extension", () => {
  it("discovers paginated preview tools and forwards calls with auth-safe configuration", async () => {
    const harness = makePiHarness();
    const configs: unknown[] = [];
    const calls: Array<{
      readonly name: string;
      readonly args: Record<string, unknown>;
      readonly signal?: AbortSignal;
    }> = [];
    let closeCalls = 0;
    const connection: T3McpConnection = {
      listTools: async (cursor) =>
        cursor
          ? {
              tools: [
                previewTool("preview_midscene_act", {
                  title: "Act on preview with Midscene",
                  schema: {
                    type: "object",
                    properties: { instruction: { type: "string" } },
                    required: ["instruction"],
                    $schema: "https://json-schema.org/draft/2020-12/schema",
                    additionalProperties: false,
                  },
                }),
              ],
            }
          : {
              tools: [previewTool("preview_status"), previewTool("unscoped_server_tool")],
              nextCursor: "page-2",
            },
      callTool: async (name, args, options) => {
        calls.push({ name, args, ...(options.signal ? { signal: options.signal } : {}) });
        options.onProgress?.({ progress: 1, total: 2, message: "Inspecting preview" });
        return {
          content: [
            { type: "text", text: "completed" },
            { type: "image", data: "AQID", mimeType: "image/png" },
          ],
          structuredContent: { ok: true },
        } as CallToolResult;
      },
      close: async () => {
        closeCalls += 1;
      },
    };
    const extension = makeT3McpPiExtension({
      environment: {
        [T3_MCP_ENDPOINT_ENV]: "http://127.0.0.1:43123/mcp",
        [T3_MCP_BEARER_TOKEN_ENV]: "secret-token",
      },
      connect: async (config) => {
        configs.push(config);
        return connection;
      },
    });

    await extension(harness.pi);

    expect(configs).toEqual([
      { endpoint: "http://127.0.0.1:43123/mcp", bearerToken: "secret-token" },
    ]);
    expect(harness.tools.map((tool) => tool.name)).toEqual([
      "preview_status",
      "preview_midscene_act",
    ]);
    const midscene = harness.tools[1];
    expect(midscene?.label).toBe("Act on preview with Midscene");
    expect(midscene?.executionMode).toBe("sequential");
    expect(midscene?.parameters).toEqual({
      type: "object",
      properties: { instruction: { type: "string" } },
      required: ["instruction"],
    });

    const controller = new AbortController();
    const updates: unknown[] = [];
    const result = await midscene?.execute(
      "tool-call-1",
      { instruction: "Open settings" },
      controller.signal,
      (update) => updates.push(update),
    );
    expect(calls).toEqual([
      {
        name: "preview_midscene_act",
        args: { instruction: "Open settings" },
        signal: controller.signal,
      },
    ]);
    expect(updates).toEqual([
      {
        content: [{ type: "text", text: "Inspecting preview" }],
        details: {
          toolName: "preview_midscene_act",
          progress: { progress: 1, total: 2, message: "Inspecting preview" },
        },
      },
    ]);
    expect(result).toEqual({
      content: [
        { type: "text", text: "completed" },
        { type: "image", data: "AQID", mimeType: "image/png" },
      ],
      details: { toolName: "preview_midscene_act", structuredContent: { ok: true } },
    });

    const beforeAgentStart = harness.handlers.get("before_agent_start")?.[0];
    const instructionResult = await beforeAgentStart?.({ systemPrompt: "base prompt" });
    expect(instructionResult).toMatchObject({
      systemPrompt: expect.stringContaining("T3 Code collaborative browser"),
    });
    const sessionShutdown = harness.handlers.get("session_shutdown")?.[0];
    await sessionShutdown?.({});
    expect(closeCalls).toBe(1);
  });

  it("marks MCP failures as tool errors without discarding a healthy connection", async () => {
    const harness = makePiHarness();
    let connectCalls = 0;
    let firstCloseCalls = 0;
    const tool = previewTool("preview_midscene_assert");
    const firstConnection: T3McpConnection = {
      listTools: async () => ({ tools: [tool] }),
      callTool: async () =>
        ({
          isError: true,
          content: [{ type: "text", text: "Configured Midscene model is unavailable." }],
        }) as CallToolResult,
      close: async () => {
        firstCloseCalls += 1;
      },
    };
    const extension = makeT3McpPiExtension({
      environment: {
        [T3_MCP_ENDPOINT_ENV]: "http://127.0.0.1:43123/mcp",
        [T3_MCP_BEARER_TOKEN_ENV]: "secret-token",
      },
      connect: async () => {
        connectCalls += 1;
        return firstConnection;
      },
    });
    await extension(harness.pi);
    const registered = harness.tools[0];

    await expect(registered?.execute("call-1", {}, undefined, undefined)).rejects.toThrow(
      "Configured Midscene model is unavailable.",
    );
    expect(connectCalls).toBe(1);
    expect(firstCloseCalls).toBe(0);
  });

  it("does not replay failed calls and reconnects on the next invocation", async () => {
    const harness = makePiHarness();
    let connectCalls = 0;
    let firstCloseCalls = 0;
    const tool = previewTool("preview_status");
    const firstConnection: T3McpConnection = {
      listTools: async () => ({ tools: [tool] }),
      callTool: async () => {
        throw new Error("MCP transport closed");
      },
      close: async () => {
        firstCloseCalls += 1;
      },
    };
    const secondConnection: T3McpConnection = {
      listTools: async () => ({ tools: [tool] }),
      callTool: async () =>
        ({ content: [{ type: "text", text: "status ready" }] }) as CallToolResult,
      close: async () => undefined,
    };
    const extension = makeT3McpPiExtension({
      environment: {
        [T3_MCP_ENDPOINT_ENV]: "http://127.0.0.1:43123/mcp",
        [T3_MCP_BEARER_TOKEN_ENV]: "secret-token",
      },
      connect: async () => {
        connectCalls += 1;
        return connectCalls === 1 ? firstConnection : secondConnection;
      },
    });
    await extension(harness.pi);
    const registered = harness.tools[0];

    await expect(registered?.execute("call-1", {}, undefined, undefined)).rejects.toThrow(
      "MCP transport closed",
    );
    expect(connectCalls).toBe(1);
    expect(firstCloseCalls).toBe(1);

    await expect(registered?.execute("call-2", {}, undefined, undefined)).resolves.toMatchObject({
      content: [{ type: "text", text: "status ready" }],
    });
    expect(connectCalls).toBe(2);
  });

  it("fails startup without both scoped MCP environment values", async () => {
    const extension = makeT3McpPiExtension({
      environment: { [T3_MCP_ENDPOINT_ENV]: "http://127.0.0.1:43123/mcp" },
      connect: async () => {
        throw new Error("connect should not run");
      },
    });

    await expect(extension(makePiHarness().pi)).rejects.toThrow(T3_MCP_BEARER_TOKEN_ENV);
  });
});
