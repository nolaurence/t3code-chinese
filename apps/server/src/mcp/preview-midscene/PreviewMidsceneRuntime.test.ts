import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import * as PreviewMidsceneRuntime from "./PreviewMidsceneRuntime.ts";

it.effect("loads and caches the pinned Midscene runtime modules on first use", () =>
  Effect.gen(function* () {
    const runtime = yield* PreviewMidsceneRuntime.make;

    const first = yield* runtime.load("act");
    const second = yield* runtime.load("query");

    expect(first.defineActions).toBe(second.defineActions);
    expect(first.createAgent).toBeTypeOf("function");
    expect(second.createAgent).toBeTypeOf("function");
  }),
);
