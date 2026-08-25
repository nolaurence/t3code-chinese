import { describe, expect, it } from "vite-plus/test";
import * as NodeBuffer from "node:buffer";

import { decodePiRpcOutput, makePiRpcLineDecoder, PiRpcProtocolError } from "./PiRpcProtocol.ts";

describe("PiRpcProtocol", () => {
  it("decodes correlated responses and agent events", () => {
    expect(
      decodePiRpcOutput({
        id: "request-1",
        type: "response",
        command: "get_state",
        success: true,
        data: { sessionId: "session-1" },
      }),
    ).toMatchObject({ id: "request-1", command: "get_state", success: true });

    expect(decodePiRpcOutput({ type: "agent_start" })).toEqual({ type: "agent_start" });
    expect(decodePiRpcOutput({ type: "agent_settled" })).toEqual({ type: "agent_settled" });
    expect(
      decodePiRpcOutput({
        type: "tool_execution_start",
        toolCallId: "call-1",
        toolName: "bash",
        args: { command: "pwd" },
      }),
    ).toMatchObject({ type: "tool_execution_start", toolCallId: "call-1" });
  });

  it("decodes extension UI requests", () => {
    expect(
      decodePiRpcOutput({
        type: "extension_ui_request",
        id: "ui-1",
        method: "confirm",
        title: "Continue?",
        message: "Run the next step?",
      }),
    ).toMatchObject({ type: "extension_ui_request", method: "confirm" });
  });

  it("frames records on LF without splitting Unicode line separators", () => {
    const decoder = makePiRpcLineDecoder();
    const records = decoder.push(
      '{"type":"extension_ui_request","id":"ui-1","method":"notify","message":"a\u2028b"}\n' +
        '{"type":"agent_start"}\n',
    );

    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ message: "a\u2028b" });
    expect(records[1]).toEqual({ type: "agent_start" });
  });

  it("preserves UTF-8 characters split across byte chunks", () => {
    const bytes = new TextEncoder().encode(
      '{"type":"extension_ui_request","id":"ui-1","method":"notify","message":"中文"}\n',
    );
    const splitAt = bytes.indexOf(0xe6) + 1;
    const decoder = makePiRpcLineDecoder();

    expect(decoder.push(bytes.slice(0, splitAt))).toEqual([]);
    expect(decoder.push(bytes.slice(splitAt))).toEqual([
      {
        type: "extension_ui_request",
        id: "ui-1",
        method: "notify",
        message: "中文",
      },
    ]);
  });

  it("accepts CRLF input while retaining strict LF record boundaries", () => {
    const decoder = makePiRpcLineDecoder();
    expect(decoder.push('{"type":"agent_start"}\r\n')).toEqual([{ type: "agent_start" }]);
  });

  it("reassembles protocol v2 chunk frames into one logical response", () => {
    const decoder = makePiRpcLineDecoder();
    expect(
      decoder.push(
        `${JSON.stringify({
          type: "ready",
          protocolVersion: 1,
          supportedProtocolVersions: [1, 2],
          maxFrameBytes: 64,
          maxReassembledFrameBytes: 64 * 1024 * 1024,
        })}\n`,
      ),
    ).toHaveLength(1);

    const response = {
      type: "response",
      id: "models-1",
      command: "get_available_models",
      success: true,
      data: { models: [{ provider: "openrouter", id: "large-model", name: "M".repeat(180) }] },
    };
    const bytes = NodeBuffer.Buffer.from(JSON.stringify(response), "utf8");
    const chunkSize = 60;
    const count = Math.ceil(bytes.byteLength / chunkSize);
    const frames = Array.from({ length: count }, (_, index) => ({
      type: "rpc_chunk",
      chunkId: "rpc-models-1",
      index,
      count,
      byteLength: bytes.byteLength,
      data: bytes.subarray(index * chunkSize, (index + 1) * chunkSize).toString("base64"),
    }));

    const records = decoder.push(`${frames.map((frame) => JSON.stringify(frame)).join("\n")}\n`);

    expect(records).toEqual([response]);
    expect(decoder.finish()).toEqual([]);
  });

  it("rejects interrupted protocol v2 chunk sequences", () => {
    const decoder = makePiRpcLineDecoder();
    decoder.push(
      `${JSON.stringify({
        type: "ready",
        maxFrameBytes: 64,
        maxReassembledFrameBytes: 64 * 1024 * 1024,
      })}\n`,
    );
    const data = NodeBuffer.Buffer.from(
      '{"type":"agent_start","padding":"' + "x".repeat(80) + '"}',
    );
    decoder.push(
      `${JSON.stringify({
        type: "rpc_chunk",
        chunkId: "rpc-interrupted",
        index: 0,
        count: 2,
        byteLength: data.byteLength,
        data: data.subarray(0, 60).toString("base64"),
      })}\n`,
    );

    expect(() => decoder.push('{"type":"agent_start"}\n')).toThrow(/interrupted/i);
  });

  it("rejects malformed JSON while accepting forward-compatible event types", () => {
    const decoder = makePiRpcLineDecoder();
    expect(() => decoder.push('{"type":\n')).toThrow(PiRpcProtocolError);
    expect(decodePiRpcOutput({ type: "future_pi_event", data: 1 })).toEqual({
      type: "future_pi_event",
      data: 1,
    });
  });

  it("rejects an unterminated record when the stream ends", () => {
    const decoder = makePiRpcLineDecoder();
    expect(decoder.push('{"type":"agent_start"}')).toEqual([]);
    expect(() => decoder.finish()).toThrow(/unterminated/i);
  });
});
