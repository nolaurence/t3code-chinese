import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";
import { ChildProcessSpawner } from "effect/unstable/process";

import { PiAgentSettings, ProviderDriverKind } from "@t3tools/contracts";
import { BUILT_IN_DRIVERS } from "../builtInDrivers.ts";
import {
  buildInitialPiProviderSnapshot,
  checkPiProviderStatus,
  mapPiAvailableModels,
} from "./PiProvider.ts";

const decodePiSettings = Schema.decodeSync(PiAgentSettings);

describe("buildInitialPiProviderSnapshot", () => {
  it.effect("returns a disabled snapshot when Pi is disabled", () =>
    Effect.gen(function* () {
      const snapshot = yield* buildInitialPiProviderSnapshot(decodePiSettings({ enabled: false }));

      expect(snapshot.status).toBe("disabled");
      expect(snapshot.installed).toBe(false);
      expect(snapshot.message).toContain("disabled");
    }),
  );

  it.effect("returns a pending snapshot before the first probe", () =>
    Effect.gen(function* () {
      const snapshot = yield* buildInitialPiProviderSnapshot(decodePiSettings({}));

      expect(snapshot.status).toBe("warning");
      expect(snapshot.installed).toBe(true);
      expect(snapshot.message).toContain("Checking Pi");
      expect(snapshot.requiresNewThreadForModelChange).toBe(true);
    }),
  );
});

describe("mapPiAvailableModels", () => {
  it("uses provider/model slugs and exposes supported thinking levels", () => {
    const models = mapPiAvailableModels(
      {
        models: [
          {
            id: "gpt-5.4",
            name: "GPT-5.4",
            provider: "openai",
            reasoning: true,
          },
          {
            id: "claude-sonnet-4-6",
            name: "Claude Sonnet 4.6",
            provider: "anthropic",
            reasoning: false,
          },
        ],
      },
      ["custom/local-model"],
    );

    expect(models.map((model) => model.slug)).toEqual([
      "openai/gpt-5.4",
      "anthropic/claude-sonnet-4-6",
      "custom/local-model",
    ]);
    expect(models[0]?.capabilities?.optionDescriptors).toEqual([
      expect.objectContaining({
        id: "effort",
        currentValue: "medium",
        options: expect.arrayContaining([
          expect.objectContaining({ id: "off" }),
          expect.objectContaining({ id: "xhigh" }),
        ]),
      }),
    ]);
    expect(models[1]?.capabilities?.optionDescriptors).toEqual([]);
    expect(models[2]?.isCustom).toBe(true);
  });

  it("keeps manually configured model slugs separate from Pi-discovered models", () => {
    const models = mapPiAvailableModels({ models: [] }, ["custom/local-model"]);

    expect(models).toEqual([
      expect.objectContaining({ slug: "custom/local-model", isCustom: true }),
    ]);
  });
});

it.layer(NodeServices.layer)("checkPiProviderStatus", (it) => {
  it.effect("reports a configured Pi binary as missing", () =>
    Effect.gen(function* () {
      const snapshot = yield* checkPiProviderStatus(
        decodePiSettings({ binaryPath: "/definitely/not/installed/pi" }),
        process.cwd(),
      );

      expect(snapshot.installed).toBe(false);
      expect(snapshot.status).toBe("error");
      expect(snapshot.message).toContain("not installed or not on PATH");
    }),
  );

  it.effect("allows Pi CLI cold starts longer than the generic provider timeout", () =>
    Effect.gen(function* () {
      const versionStarted = yield* Deferred.make<void>();
      const rpcOutput = yield* Deferred.make<Uint8Array>();
      let spawnCount = 0;
      const spawner = ChildProcessSpawner.make(() => {
        spawnCount += 1;
        if (spawnCount === 1) {
          return Deferred.succeed(versionStarted, undefined).pipe(
            Effect.as(
              ChildProcessSpawner.makeHandle({
                pid: ChildProcessSpawner.ProcessId(1),
                exitCode: Effect.sleep("16 seconds").pipe(
                  Effect.as(ChildProcessSpawner.ExitCode(0)),
                ),
                isRunning: Effect.succeed(false),
                kill: () => Effect.void,
                unref: Effect.succeed(Effect.void),
                stdin: Sink.drain,
                stdout: Stream.encodeText(Stream.make("0.80.7\n")),
                stderr: Stream.empty,
                all: Stream.empty,
                getInputFd: () => Sink.drain,
                getOutputFd: () => Stream.empty,
              }),
            ),
          );
        }

        return Effect.succeed(
          ChildProcessSpawner.makeHandle({
            pid: ChildProcessSpawner.ProcessId(2),
            exitCode: Effect.never,
            isRunning: Effect.succeed(true),
            kill: () => Effect.void,
            unref: Effect.succeed(Effect.void),
            stdin: Sink.forEach((bytes: Uint8Array) => {
              const request = JSON.parse(new TextDecoder().decode(bytes)) as {
                readonly id: string;
                readonly type: string;
              };
              return Deferred.succeed(
                rpcOutput,
                new TextEncoder().encode(
                  `${JSON.stringify({
                    type: "response",
                    id: request.id,
                    command: request.type,
                    success: true,
                    data: {
                      models: [
                        {
                          id: "gpt-5.4",
                          name: "GPT-5.4",
                          provider: "openai",
                          reasoning: true,
                        },
                      ],
                    },
                  })}\n`,
                ),
              ).pipe(Effect.asVoid);
            }),
            stdout: Stream.fromEffect(Deferred.await(rpcOutput)),
            stderr: Stream.empty,
            all: Stream.empty,
            getInputFd: () => Sink.drain,
            getOutputFd: () => Stream.empty,
          }),
        );
      });

      const snapshotFiber = yield* checkPiProviderStatus(
        decodePiSettings({ binaryPath: "/test/pi" }),
        process.cwd(),
      ).pipe(
        Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
        Effect.forkChild,
      );
      yield* Deferred.await(versionStarted);
      yield* TestClock.adjust("16 seconds");
      const snapshot = yield* Fiber.join(snapshotFiber);

      expect(snapshot.status).toBe("ready");
      expect(snapshot.version).toBe("0.80.7");
      expect(snapshot.models.map((model) => model.slug)).toContain("openai/gpt-5.4");
    }).pipe(Effect.provide(Layer.merge(NodeServices.layer, TestClock.layer()))),
  );
});

describe("built-in Pi driver", () => {
  it("registers piAgent as a first-party provider", () => {
    expect(BUILT_IN_DRIVERS.map((driver) => driver.driverKind)).toContain(
      ProviderDriverKind.make("piAgent"),
    );
  });
});
