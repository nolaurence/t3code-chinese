import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

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
});

describe("built-in Pi driver", () => {
  it("registers piAgent as a first-party provider", () => {
    expect(BUILT_IN_DRIVERS.map((driver) => driver.driverKind)).toContain(
      ProviderDriverKind.make("piAgent"),
    );
  });
});
