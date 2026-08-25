import { describe, expect, it } from "vite-plus/test";

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
