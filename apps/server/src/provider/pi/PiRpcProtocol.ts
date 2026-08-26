import * as Schema from "effect/Schema";
import * as NodeBuffer from "node:buffer";

export class PiRpcProtocolError extends Error {
  readonly line: string | undefined;

  constructor(message: string, options?: { readonly line?: string; readonly cause?: unknown }) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "PiRpcProtocolError";
    this.line = options?.line;
  }
}

const UnknownFromJsonString = Schema.fromJsonString(Schema.Unknown);
const decodeUnknownJsonString = Schema.decodeUnknownSync(UnknownFromJsonString);
const encodeUnknownJsonString = Schema.encodeUnknownSync(UnknownFromJsonString);

export function encodePiRpcJsonString(value: unknown): string {
  return encodeUnknownJsonString(value);
}

export interface PiRpcImageContent {
  readonly type: "image";
  readonly data: string;
  readonly mimeType: string;
}

export type PiRpcCommand =
  | { readonly id?: string; readonly type: "negotiate_protocol"; readonly protocolVersion: 2 }
  | {
      readonly id?: string;
      readonly type: "prompt";
      readonly message: string;
      readonly images?: ReadonlyArray<PiRpcImageContent>;
      readonly streamingBehavior?: "steer" | "followUp";
    }
  | { readonly id?: string; readonly type: "steer"; readonly message: string }
  | { readonly id?: string; readonly type: "follow_up"; readonly message: string }
  | { readonly id?: string; readonly type: "abort" }
  | { readonly id?: string; readonly type: "get_state" }
  | { readonly id?: string; readonly type: "get_messages" }
  | {
      readonly id?: string;
      readonly type: "get_messages_page";
      readonly cursor?: string;
      readonly limit?: number;
    }
  | { readonly id?: string; readonly type: "get_last_assistant_text" }
  | { readonly id?: string; readonly type: "get_available_models" }
  | { readonly id?: string; readonly type: "get_session_stats" }
  | {
      readonly id?: string;
      readonly type: "set_model";
      readonly provider: string;
      readonly modelId: string;
    }
  | { readonly id?: string; readonly type: "set_thinking_level"; readonly level: string }
  | { readonly id?: string; readonly type: "switch_session"; readonly sessionPath: string }
  | { readonly id?: string; readonly type: "set_session_name"; readonly name: string }
  | PiExtensionUIResponse;

export type PiExtensionUIResponse =
  | { readonly id: string; readonly type: "extension_ui_response"; readonly value: string }
  | { readonly id: string; readonly type: "extension_ui_response"; readonly confirmed: boolean }
  | { readonly id: string; readonly type: "extension_ui_response"; readonly cancelled: true };

export type PiRpcResponse =
  | {
      readonly id?: string;
      readonly type: "response";
      readonly command: string;
      readonly success: true;
      readonly data?: unknown;
    }
  | {
      readonly id?: string;
      readonly type: "response";
      readonly command: string;
      readonly success: false;
      readonly error: string;
      readonly code?: string;
    };

export type PiExtensionUIRequest = {
  readonly type: "extension_ui_request";
  readonly id: string;
  readonly method:
    | "select"
    | "confirm"
    | "input"
    | "editor"
    | "notify"
    | "setStatus"
    | "setWidget"
    | "setTitle"
    | "set_editor_text";
  readonly [key: string]: unknown;
};

export type PiAgentEvent = {
  readonly type:
    | "agent_start"
    | "agent_end"
    | "turn_start"
    | "turn_end"
    | "message_start"
    | "message_update"
    | "message_end"
    | "tool_execution_start"
    | "tool_execution_update"
    | "tool_execution_end"
    | "queue_update"
    | "compaction_start"
    | "compaction_end"
    | "auto_retry_start"
    | "auto_retry_end"
    | "extension_error"
    | "agent_settled"
    | "prompt_result"
    | "todo_reminder"
    | "todo_auto_clear"
    | "entry_appended"
    | "session_info_changed"
    | "thinking_level_changed";
  readonly [key: string]: unknown;
};

/**
 * Pi adds session lifecycle events independently of the request/response protocol.
 * Keep these records open so a new informational event cannot invalidate an entire
 * stdout chunk containing response deltas that we already understand.
 */
export type PiRpcEvent = {
  readonly type: string;
  readonly [key: string]: unknown;
};

export interface PiRpcReadyFrame {
  readonly type: "ready";
  readonly protocolVersion?: number;
  readonly supportedProtocolVersions?: ReadonlyArray<number>;
  readonly maxFrameBytes?: number;
  readonly maxReassembledFrameBytes?: number;
}

export type PiRpcOutput =
  | PiRpcResponse
  | PiExtensionUIRequest
  | PiAgentEvent
  | PiRpcReadyFrame
  | PiRpcEvent;

export function isPiRpcResponse(output: PiRpcOutput): output is PiRpcResponse {
  return output.type === "response";
}

export function isPiRpcReadyFrame(output: PiRpcOutput): output is PiRpcReadyFrame {
  return output.type === "ready";
}

export function decodePiRpcJsonString(value: string): PiRpcOutput {
  return decodePiRpcOutput(decodeUnknownJsonString(value));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function optionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

export function decodePiRpcOutput(value: unknown): PiRpcOutput {
  const record = asRecord(value);
  if (!record || typeof record.type !== "string") {
    throw new PiRpcProtocolError("Pi RPC output must be an object with a string type.");
  }

  if (record.type === "response") {
    if (
      !optionalString(record.id) ||
      typeof record.command !== "string" ||
      typeof record.success !== "boolean"
    ) {
      throw new PiRpcProtocolError("Pi RPC response has invalid correlation fields.");
    }
    if (
      record.success === false &&
      (typeof record.error !== "string" || !optionalString(record.code))
    ) {
      throw new PiRpcProtocolError("Failed Pi RPC response has invalid error fields.");
    }
    return record as PiRpcResponse;
  }

  if (record.type === "extension_ui_request") {
    if (typeof record.id !== "string" || typeof record.method !== "string") {
      throw new PiRpcProtocolError("Pi extension UI request has invalid fields.");
    }
    return record as PiExtensionUIRequest;
  }

  return record as PiRpcEvent;
}

export interface PiRpcLineDecoder {
  readonly push: (chunk: string | Uint8Array) => ReadonlyArray<PiRpcOutput>;
  readonly finish: () => ReadonlyArray<PiRpcOutput>;
}

const DEFAULT_MAX_FRAME_BYTES = 1024 * 1024;
const MAX_REASSEMBLED_FRAME_BYTES = 64 * 1024 * 1024;
const MAX_CHUNK_PAYLOAD_BYTES = 256 * 1024;
const BASE64_REGEX = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

interface PendingPiRpcChunks {
  readonly chunkId: string;
  readonly count: number;
  readonly byteLength: number;
  nextIndex: number;
  receivedBytes: number;
  readonly chunks: Array<Buffer>;
}

function decodeBase64Chunk(data: unknown): Buffer {
  if (typeof data !== "string" || data.length === 0 || !BASE64_REGEX.test(data)) {
    throw new PiRpcProtocolError("Pi RPC chunk data is not valid base64.");
  }
  const bytes = NodeBuffer.Buffer.from(data, "base64");
  if (bytes.toString("base64") !== data) {
    throw new PiRpcProtocolError("Pi RPC chunk data is not canonical base64.");
  }
  return bytes;
}

function makePiRpcFrameDecoder() {
  let maxFrameBytes = DEFAULT_MAX_FRAME_BYTES;
  let maxReassembledFrameBytes = MAX_REASSEMBLED_FRAME_BYTES;
  let pending: PendingPiRpcChunks | undefined;

  const updateAdvertisedLimits = (record: Record<string, unknown>) => {
    if (record.type !== "ready") return;
    if (
      typeof record.maxFrameBytes === "number" &&
      Number.isSafeInteger(record.maxFrameBytes) &&
      record.maxFrameBytes > 0
    ) {
      maxFrameBytes = Math.min(record.maxFrameBytes, MAX_REASSEMBLED_FRAME_BYTES);
    }
    if (
      typeof record.maxReassembledFrameBytes === "number" &&
      Number.isSafeInteger(record.maxReassembledFrameBytes) &&
      record.maxReassembledFrameBytes >= maxFrameBytes
    ) {
      maxReassembledFrameBytes = Math.min(
        record.maxReassembledFrameBytes,
        MAX_REASSEMBLED_FRAME_BYTES,
      );
    }
  };

  const push = (value: unknown): unknown | undefined => {
    const record = asRecord(value);
    if (!record) throw new PiRpcProtocolError("Pi RPC frame must be an object.");
    if (record.type !== "rpc_chunk") {
      if (pending) throw new PiRpcProtocolError("Pi RPC chunk sequence was interrupted.");
      updateAdvertisedLimits(record);
      return record;
    }

    const { chunkId, index, count, byteLength } = record;
    if (
      typeof chunkId !== "string" ||
      chunkId.length === 0 ||
      chunkId.length > 128 ||
      typeof index !== "number" ||
      !Number.isSafeInteger(index) ||
      typeof count !== "number" ||
      !Number.isSafeInteger(count) ||
      typeof byteLength !== "number" ||
      !Number.isSafeInteger(byteLength) ||
      index < 0 ||
      count < 2 ||
      count > Math.ceil(maxReassembledFrameBytes / MAX_CHUNK_PAYLOAD_BYTES) ||
      index >= count ||
      byteLength < maxFrameBytes ||
      byteLength > maxReassembledFrameBytes
    ) {
      throw new PiRpcProtocolError("Pi RPC chunk metadata is invalid.");
    }

    const bytes = decodeBase64Chunk(record.data);
    if (bytes.byteLength > MAX_CHUNK_PAYLOAD_BYTES) {
      throw new PiRpcProtocolError("Pi RPC chunk payload exceeds the transport limit.");
    }
    if (!pending) {
      if (index !== 0) {
        throw new PiRpcProtocolError("Pi RPC chunk sequence must start at index zero.");
      }
      pending = {
        chunkId,
        count,
        byteLength,
        nextIndex: 0,
        receivedBytes: 0,
        chunks: [],
      };
    }
    if (
      pending.chunkId !== chunkId ||
      pending.count !== count ||
      pending.byteLength !== byteLength ||
      pending.nextIndex !== index
    ) {
      throw new PiRpcProtocolError("Pi RPC chunk sequence does not match its preceding frames.");
    }

    pending.chunks.push(bytes);
    pending.receivedBytes += bytes.byteLength;
    pending.nextIndex += 1;
    if (pending.receivedBytes > pending.byteLength) {
      throw new PiRpcProtocolError("Pi RPC chunk sequence exceeds its declared length.");
    }
    if (pending.nextIndex < pending.count) return undefined;
    if (pending.receivedBytes !== pending.byteLength) {
      throw new PiRpcProtocolError("Pi RPC chunk sequence does not match its declared length.");
    }

    const completed = pending;
    pending = undefined;
    try {
      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(
        NodeBuffer.Buffer.concat(completed.chunks, completed.receivedBytes),
      );
      return decodeUnknownJsonString(decoded);
    } catch (cause) {
      throw new PiRpcProtocolError("Pi RPC chunk sequence did not contain valid UTF-8 JSON.", {
        cause,
      });
    }
  };

  const finish = () => {
    if (pending) throw new PiRpcProtocolError("Pi RPC stream ended during a chunk sequence.");
  };

  return { push, finish };
}

export function makePiRpcLineDecoder(): PiRpcLineDecoder {
  const textDecoder = new TextDecoder();
  const frameDecoder = makePiRpcFrameDecoder();
  let buffer = "";

  const decodeLine = (rawLine: string): PiRpcOutput | null => {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (line.trim().length === 0) return null;
    try {
      const frame = frameDecoder.push(decodeUnknownJsonString(line));
      return frame === undefined ? null : decodePiRpcOutput(frame);
    } catch (cause) {
      if (cause instanceof PiRpcProtocolError) throw cause;
      throw new PiRpcProtocolError("Pi RPC emitted malformed JSON.", {
        line: line.slice(0, 500),
        cause,
      });
    }
  };

  const drain = (): ReadonlyArray<PiRpcOutput> => {
    const records: PiRpcOutput[] = [];
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const record = decodeLine(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      if (record) records.push(record);
      newline = buffer.indexOf("\n");
    }
    return records;
  };

  return {
    push: (chunk) => {
      buffer += typeof chunk === "string" ? chunk : textDecoder.decode(chunk, { stream: true });
      return drain();
    },
    finish: () => {
      buffer += textDecoder.decode();
      const records = drain();
      if (buffer.length > 0) {
        throw new PiRpcProtocolError("Pi RPC stream ended with an unterminated JSONL record.", {
          line: buffer.slice(0, 500),
        });
      }
      frameDecoder.finish();
      return records;
    },
  };
}
