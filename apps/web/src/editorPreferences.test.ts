import {
  AuthOrchestrationOperateScope,
  EnvironmentAuthorizationError,
  EnvironmentId,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/reactivity";
import { assert, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { Translate } from "./i18n";

const state = vi.hoisted(() => ({
  allowed: new Set<string>(),
  run: vi.fn(),
  getPreference: vi.fn(),
  setPreference: vi.fn(),
}));

vi.mock("react", () => ({ useCallback: (callback: unknown) => callback }));
vi.mock("./state/shell", () => ({ shellEnvironment: { openInEditor: "openInEditor" } }));
vi.mock("./state/use-atom-command", () => ({ useAtomCommand: () => state.run }));
vi.mock("./state/session", () => ({
  readEnvironmentScope: (environmentId: string, scope: string) =>
    scope === AuthOrchestrationOperateScope && state.allowed.has(environmentId),
}));
vi.mock("./hooks/useLocalStorage", () => ({
  getLocalStorageItem: state.getPreference,
  setLocalStorageItem: state.setPreference,
  useLocalStorage: vi.fn(),
}));

import {
  localizedPreferredEditorErrorMessage,
  PreferredEditorEnvironmentRequiredError,
  PreferredEditorUnavailableError,
  useOpenInPreferredEditor,
} from "./editorPreferences";

const primary = EnvironmentId.make("primary");
const secondary = EnvironmentId.make("secondary");

const mappedTranslate = ((key, values) =>
  `${key}:${values?.targetPath ?? ""}:${values?.environmentId ?? ""}`) as Translate;

beforeEach(() => {
  state.allowed.clear();
  state.run.mockReset().mockResolvedValue(AsyncResult.success(undefined));
  state.getPreference.mockReset().mockReturnValue(null);
  state.setPreference.mockReset();
});

it("does not use another environment's grant or change preferences when denied", async () => {
  state.allowed.add(primary);
  const open = useOpenInPreferredEditor(secondary, ["vscode"]);
  const result = await open("/work/readme.md");
  assert(result._tag === "Failure");
  const error = Cause.squash(result.cause);
  expect(error).toBeInstanceOf(EnvironmentAuthorizationError);
  expect(error).toMatchObject({ requiredScope: AuthOrchestrationOperateScope });
  expect(state.run).not.toHaveBeenCalled();
  expect(state.getPreference).not.toHaveBeenCalled();
  expect(state.setPreference).not.toHaveBeenCalled();
});

it("checks revocation and regrant when a retained editor callback is invoked", async () => {
  state.allowed.add(secondary);
  const open = useOpenInPreferredEditor(secondary, ["vscode"]);
  state.allowed.delete(secondary);
  expect((await open("/work/readme.md:5"))._tag).toBe("Failure");
  expect(state.run).not.toHaveBeenCalled();

  state.allowed.add(secondary);
  expect(await open("/work/readme.md:5")).toMatchObject({ _tag: "Success", value: "vscode" });
  expect(state.run).toHaveBeenCalledExactlyOnceWith({
    environmentId: secondary,
    input: { cwd: "/work/readme.md:5", editor: "vscode" },
  });
  expect(state.setPreference).toHaveBeenCalledTimes(1);
});

describe("localizedPreferredEditorErrorMessage", () => {
  it("maps a missing environment without translating the target path", () => {
    const error = new PreferredEditorEnvironmentRequiredError({
      targetPath: "/workspace/README.md",
    });

    expect(localizedPreferredEditorErrorMessage(error, mappedTranslate)).toBe(
      "editorPreferences.environmentRequired:/workspace/README.md:",
    );
    expect(error.message).toBe(
      "Cannot open /workspace/README.md because no environment is selected.",
    );
  });

  it("maps an unavailable editor without translating path or environment ID", () => {
    const error = new PreferredEditorUnavailableError({
      environmentId: EnvironmentId.make("env-local"),
      targetPath: "/workspace/src/index.ts",
      availableEditorIds: [],
    });

    expect(localizedPreferredEditorErrorMessage(error, mappedTranslate)).toBe(
      "editorPreferences.editorUnavailable:/workspace/src/index.ts:env-local",
    );
    expect(error.message).toBe(
      "No available editor can open /workspace/src/index.ts in environment env-local.",
    );
  });
});
