import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import { ProviderInstanceId } from "@t3tools/contracts";
import { HostProcessPlatform } from "@t3tools/shared/hostProcess";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import { HttpClient } from "effect/unstable/http";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";

import * as BackgroundPolicy from "../../background/BackgroundPolicy.ts";
import { ServerConfig } from "../../config.ts";
import { ServerSettingsService } from "../../serverSettings.ts";
import { NoOpProviderEventLoggers, ProviderEventLoggers } from "../Layers/ProviderEventLoggers.ts";
import { OmpDriver } from "./OmpDriver.ts";
import { PiDriver } from "./PiDriver.ts";

const testLayer = ServerConfig.layerTest(process.cwd(), {
  prefix: "t3-pi-driver-update-",
}).pipe(
  Layer.provideMerge(NodeServices.layer),
  Layer.provideMerge(ServerSettingsService.layerTest()),
  Layer.provideMerge(
    Layer.mock(BackgroundPolicy.BackgroundPolicy)({
      shouldRunScopeWork: () => Effect.succeed(false),
    }),
  ),
  Layer.provideMerge(Layer.succeed(ProviderEventLoggers, NoOpProviderEventLoggers)),
  Layer.provideMerge(
    Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.make(() => Effect.die("Disabled Pi providers must not make HTTP requests")),
    ),
  ),
);

const noSpawner = ChildProcessSpawner.make(() =>
  Effect.die("Disabled Pi providers must not spawn processes"),
);
const windowsHost = HostProcessPlatform.defaultValue() === "win32";

it.layer(testLayer)("Pi provider maintenance", (it) => {
  for (const { driver, binaryName, packageName } of [
    { driver: PiDriver, binaryName: "pi", packageName: "@earendil-works/pi-coding-agent" },
    { driver: OmpDriver, binaryName: "omp", packageName: "@oh-my-pi/pi-coding-agent" },
  ]) {
    it.effect.skipIf(windowsHost)(
      `${driver.metadata.displayName} rechecks install ownership on a fresh read`,
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const tempDir = yield* fs.makeTempDirectoryScoped({ prefix: "t3-pi-maintenance-" });
          const binaryPath = path.join(tempDir, ".bun", "bin", binaryName);
          const instance = yield* driver.create({
            instanceId: ProviderInstanceId.make(`${binaryName}-update`),
            enabled: false,
            environment: [{ name: "PATH", value: "", sensitive: false }],
            config: { ...driver.defaultConfig(), binaryPath },
          });

          expect((yield* instance.snapshot.resolveMaintenance()).update).toBeNull();
          yield* fs.makeDirectory(path.dirname(binaryPath), { recursive: true });
          yield* fs.writeFileString(binaryPath, "#!/bin/sh\n");
          yield* fs.chmod(binaryPath, 0o755);

          expect((yield* instance.snapshot.resolveMaintenance()).update).toBeNull();
          const fresh = yield* instance.snapshot.resolveMaintenance({ fresh: true });
          expect(fresh.packageName).toBe(packageName);
          expect(fresh.update).toMatchObject({
            executable: "bun",
            args: ["i", "-g", `${packageName}@latest`],
          });
          expect(yield* instance.snapshot.resolveMaintenance()).toEqual(fresh);
        }).pipe(
          Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, noSpawner),
          Effect.scoped,
        ),
    );
  }
});
