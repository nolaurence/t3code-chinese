import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as PubSub from "effect/PubSub";
import * as Queue from "effect/Queue";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as ChildProcess from "effect/unstable/process/ChildProcess";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";
import { resolveSpawnCommand } from "@t3tools/shared/shell";

import { collectUint8StreamText } from "../../stream/collectUint8StreamText.ts";
import {
  encodePiRpcJsonString,
  isPiRpcResponse,
  isPiRpcReadyFrame,
  makePiRpcLineDecoder,
  type PiRpcCommand,
  type PiRpcOutput,
  type PiRpcReadyFrame,
  type PiRpcResponse,
} from "./PiRpcProtocol.ts";

export class PiRpcClientError extends Schema.TaggedErrorClass<PiRpcClientError>()(
  "PiRpcClientError",
  {
    operation: Schema.String,
    detail: Schema.String,
    exitCode: Schema.optional(Schema.Number),
    stderr: Schema.optional(Schema.String),
    cause: Schema.optional(Schema.Defect()),
  },
) {
  override get message(): string {
    return this.detail;
  }
}

export interface PiRpcTransport {
  readonly output: Stream.Stream<Uint8Array, PiRpcClientError>;
  readonly exitCode: Effect.Effect<number, PiRpcClientError>;
  readonly write: (line: string) => Effect.Effect<void, PiRpcClientError>;
  readonly close: Effect.Effect<void, PiRpcClientError>;
  readonly processExitError?: (code: number) => Effect.Effect<PiRpcClientError>;
}

export interface PiRpcClient {
  readonly request: (command: PiRpcCommand) => Effect.Effect<PiRpcResponse, PiRpcClientError>;
  readonly send: (command: PiRpcCommand) => Effect.Effect<void, PiRpcClientError>;
  readonly events: Stream.Stream<Exclude<PiRpcOutput, PiRpcResponse>>;
  readonly ready: Effect.Effect<PiRpcReadyFrame, PiRpcClientError>;
  readonly terminated: Effect.Effect<PiRpcClientError>;
  readonly close: Effect.Effect<void>;
}

export interface SpawnPiRpcClientOptions {
  readonly binaryPath: string;
  readonly cwd: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly args?: ReadonlyArray<string>;
  readonly captureStderrOnExit?: boolean;
  readonly negotiateProtocolV2?: boolean;
}

const STDERR_CAPTURE_MAX_BYTES = 16 * 1024;
const ANSI_ESCAPE_CHAR = String.fromCharCode(27);
const ANSI_ESCAPE_REGEX = new RegExp(`${ANSI_ESCAPE_CHAR}\\[[0-9;]*[A-Za-z]`, "g");
const BEARER_TOKEN_REGEX = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const AUTHORIZATION_ASSIGNMENT_REGEX = /\b(authorization)(\s*[:=]\s*)[^\r\n]+/gi;
const SENSITIVE_ASSIGNMENT_REGEX =
  /\b(api[_ -]?key|access[_ -]?token|refresh[_ -]?token|secret)\b(\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,}]+)/gi;

function sanitizePiRpcStderr(value: string): string {
  return value
    .replaceAll(ANSI_ESCAPE_REGEX, "")
    .replaceAll(BEARER_TOKEN_REGEX, "Bearer <redacted>")
    .replaceAll(AUTHORIZATION_ASSIGNMENT_REGEX, "$1$2<redacted>")
    .replaceAll(SENSITIVE_ASSIGNMENT_REGEX, "$1$2<redacted>")
    .trim();
}

function clientError(
  operation: string,
  detail: string,
  options: {
    readonly cause?: unknown;
    readonly exitCode?: number;
    readonly stderr?: string;
  } = {},
): PiRpcClientError {
  return new PiRpcClientError({
    operation,
    detail,
    ...(options.exitCode === undefined ? {} : { exitCode: options.exitCode }),
    ...(options.stderr === undefined ? {} : { stderr: options.stderr }),
    ...(options.cause === undefined ? {} : { cause: options.cause }),
  });
}

export const makePiRpcClient = Effect.fn("makePiRpcClient")(function* (transport: PiRpcTransport) {
  const events = yield* PubSub.unbounded<Exclude<PiRpcOutput, PiRpcResponse>>();
  const pending = new Map<string, Deferred.Deferred<PiRpcResponse, PiRpcClientError>>();
  const ready = yield* Deferred.make<PiRpcReadyFrame, PiRpcClientError>();
  const terminated = yield* Deferred.make<PiRpcClientError>();
  const decoder = makePiRpcLineDecoder();
  let nextRequestId = 0;
  let terminalError: PiRpcClientError | undefined;
  let closed = false;

  const failPending = Effect.fn("PiRpcClient.failPending")(function* (error: PiRpcClientError) {
    terminalError ??= error;
    yield* Deferred.fail(ready, error).pipe(Effect.ignore);
    yield* Deferred.succeed(terminated, error).pipe(Effect.ignore);
    const deferreds = [...pending.values()];
    pending.clear();
    yield* Effect.forEach(deferreds, (deferred) => Deferred.fail(deferred, error), {
      discard: true,
    });
  });

  const handleOutput = Effect.fn("PiRpcClient.handleOutput")(function* (output: PiRpcOutput) {
    if (!isPiRpcResponse(output)) {
      if (isPiRpcReadyFrame(output)) {
        yield* Deferred.succeed(ready, output).pipe(Effect.ignore);
      }
      yield* PubSub.publish(events, output);
      return;
    }
    if (!output.id) return;
    const deferred = pending.get(output.id);
    if (!deferred) return;
    pending.delete(output.id);
    if (output.success) {
      yield* Deferred.succeed(deferred, output);
    } else {
      yield* Deferred.fail(
        deferred,
        clientError("request", `Pi RPC ${output.command} failed: ${output.error}`),
      );
    }
  });

  const readOutput = Stream.runForEach(transport.output, (chunk) =>
    Effect.try({
      try: () => decoder.push(chunk),
      catch: (cause) => clientError("protocol", "Pi RPC protocol output is invalid.", { cause }),
    }).pipe(
      Effect.flatMap((outputs) =>
        Effect.forEach(outputs, handleOutput, {
          discard: true,
        }),
      ),
    ),
  ).pipe(
    Effect.andThen(
      Effect.try({
        try: () => decoder.finish(),
        catch: (cause) =>
          clientError("protocol", "Pi RPC protocol stream ended invalidly.", { cause }),
      }),
    ),
    Effect.flatMap((outputs) => Effect.forEach(outputs, handleOutput, { discard: true })),
    Effect.catch((error) => failPending(error)),
  );
  yield* Effect.forkScoped(readOutput);

  yield* Effect.forkScoped(
    transport.exitCode.pipe(
      Effect.mapError((cause) =>
        clientError("process-exit", "Failed to observe the Pi RPC process exit.", { cause }),
      ),
      Effect.flatMap((code) =>
        (transport.processExitError
          ? transport.processExitError(code)
          : Effect.succeed(
              clientError("process-exit", `Pi RPC process exited with status ${String(code)}.`, {
                exitCode: code,
              }),
            )
        ).pipe(Effect.flatMap(failPending)),
      ),
      Effect.catch((error) => failPending(error)),
    ),
  );

  const write = (line: string) => transport.write(line);

  const request: PiRpcClient["request"] = Effect.fn("PiRpcClient.request")(function* (command) {
    if (terminalError) return yield* terminalError;
    const id = `t3-pi-${++nextRequestId}`;
    const deferred = yield* Deferred.make<PiRpcResponse, PiRpcClientError>();
    pending.set(id, deferred);
    return yield* write(`${encodePiRpcJsonString({ ...command, id })}\n`).pipe(
      Effect.andThen(Deferred.await(deferred)),
      Effect.ensuring(
        Effect.sync(() => {
          pending.delete(id);
        }),
      ),
    );
  });

  const send: PiRpcClient["send"] = Effect.fn("PiRpcClient.send")(function* (command) {
    if (terminalError) return yield* terminalError;
    yield* write(`${encodePiRpcJsonString(command)}\n`);
  });

  const close = Effect.gen(function* () {
    if (closed) return;
    closed = true;
    const error = clientError("close", "Pi RPC client was closed.");
    yield* failPending(error);
    yield* transport.close.pipe(Effect.ignore);
  });

  yield* Effect.addFinalizer(() => close);

  return {
    request,
    send,
    events: Stream.fromPubSub(events),
    ready: Deferred.await(ready),
    terminated: Deferred.await(terminated),
    close,
  } satisfies PiRpcClient;
});

export const spawnPiRpcClient = Effect.fn("spawnPiRpcClient")(function* (
  options: SpawnPiRpcClientOptions,
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const args = ["--mode", "rpc", ...(options.args ?? [])];
  const resolved = yield* resolveSpawnCommand(
    options.binaryPath,
    args,
    options.env ? { env: options.env, extendEnv: true } : {},
  ).pipe(
    Effect.mapError((cause) =>
      clientError("spawn", `Failed to resolve Pi binary '${options.binaryPath}'.`, { cause }),
    ),
  );
  const child = yield* spawner
    .spawn(
      ChildProcess.make(resolved.command, resolved.args, {
        cwd: options.cwd,
        ...(options.env ? { env: options.env, extendEnv: true } : {}),
        shell: resolved.shell,
      }),
    )
    .pipe(
      Effect.mapError((cause) =>
        clientError("spawn", `Failed to start Pi binary '${options.binaryPath}'.`, { cause }),
      ),
    );
  const input = yield* Queue.unbounded<Uint8Array>();
  let transportClosed = false;
  let processExitError: PiRpcTransport["processExitError"];

  yield* Stream.fromQueue(input).pipe(Stream.run(child.stdin), Effect.ignore, Effect.forkScoped);
  if (options.captureStderrOnExit) {
    const stderrFiber = yield* collectUint8StreamText({
      stream: child.stderr,
      maxBytes: STDERR_CAPTURE_MAX_BYTES,
      truncatedMarker: "\n[stderr truncated]",
    }).pipe(
      Effect.map((result) => sanitizePiRpcStderr(result.text)),
      Effect.orElseSucceed(() => ""),
      Effect.forkScoped,
    );
    processExitError = (code) =>
      Fiber.join(stderrFiber).pipe(
        Effect.map((stderr) =>
          clientError(
            "process-exit",
            `Pi RPC process exited with status ${String(code)}.${stderr ? ` ${stderr}` : ""}`,
            {
              exitCode: code,
              ...(stderr ? { stderr } : {}),
            },
          ),
        ),
      );
  } else {
    yield* Stream.runDrain(child.stderr).pipe(Effect.ignore, Effect.forkScoped);
  }

  const transport: PiRpcTransport = {
    output: child.stdout.pipe(
      Stream.mapError((cause) =>
        clientError("read", "Failed to read Pi RPC process output.", { cause }),
      ),
    ),
    exitCode: child.exitCode.pipe(
      Effect.map(Number),
      Effect.mapError((cause) =>
        clientError("process-exit", "Failed to observe Pi RPC process exit.", { cause }),
      ),
    ),
    ...(processExitError ? { processExitError } : {}),
    write: (line) =>
      transportClosed
        ? Effect.fail(clientError("write", "Pi RPC transport is closed."))
        : Queue.offer(input, new TextEncoder().encode(line)).pipe(Effect.asVoid),
    close: Effect.gen(function* () {
      if (transportClosed) return;
      transportClosed = true;
      yield* Queue.shutdown(input);
      const running = yield* child.isRunning.pipe(Effect.orElseSucceed(() => false));
      if (running) yield* child.kill({ forceKillAfter: "2 seconds" }).pipe(Effect.ignore);
    }),
  };

  const client = yield* makePiRpcClient(transport);
  if (!options.negotiateProtocolV2) return client;

  const ready = yield* client.ready;
  if (!ready.supportedProtocolVersions?.includes(2)) return client;
  yield* client.request({ type: "negotiate_protocol", protocolVersion: 2 });
  return client;
});
