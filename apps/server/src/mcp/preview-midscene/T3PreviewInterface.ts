import type {
  PreviewAutomationPressInput,
  PreviewAutomationSnapshot,
  PreviewAutomationStatus,
} from "@t3tools/contracts";
import type { LocateResultElement } from "@midscene/core";
import type { AbstractInterface, DeviceAction, InputPrimitives } from "@midscene/core/device";

type PreviewModifier = NonNullable<PreviewAutomationPressInput["modifiers"]>[number];

export interface T3PreviewOperations {
  readonly status: () => Promise<PreviewAutomationStatus>;
  readonly snapshot: () => Promise<PreviewAutomationSnapshot>;
  readonly click: (input: { readonly x: number; readonly y: number }) => Promise<void>;
  readonly type: (input: { readonly text: string; readonly clear: boolean }) => Promise<void>;
  readonly press: (input: {
    readonly key: string;
    readonly modifiers?: ReadonlyArray<PreviewModifier>;
  }) => Promise<void>;
  readonly scroll: (input: {
    readonly deltaX: number;
    readonly deltaY: number;
    readonly x?: number;
    readonly y?: number;
  }) => Promise<void>;
}

export type DefineMidsceneActions = (input: InputPrimitives) => ReadonlyArray<DeviceAction>;

const targetPoint = (target: unknown): { readonly x: number; readonly y: number } | undefined => {
  const located = target as LocateResultElement | undefined;
  const center = located?.center;
  return center && Number.isFinite(center[0]) && Number.isFinite(center[1])
    ? { x: center[0], y: center[1] }
    : undefined;
};

const modifierAliases: Readonly<Record<string, PreviewModifier>> = {
  alt: "Alt",
  option: "Alt",
  control: "Control",
  ctrl: "Control",
  meta: "Meta",
  command: "Meta",
  cmd: "Meta",
  shift: "Shift",
};

export function parseMidsceneKeyName(keyName: string): {
  readonly key: string;
  readonly modifiers?: ReadonlyArray<PreviewModifier>;
} {
  if (keyName === "+") return { key: "+" };
  const parts = keyName.split("+");
  const key = parts.pop()?.trim() || keyName;
  const modifiers = Array.from(
    new Set(
      parts.flatMap((part) => {
        const modifier = modifierAliases[part.trim().toLowerCase()];
        return modifier ? [modifier] : [];
      }),
    ),
  );
  return modifiers.length === 0 ? { key } : { key, modifiers };
}

export class T3PreviewInterface implements AbstractInterface {
  readonly interfaceType = "t3-preview";

  readonly inputPrimitives: InputPrimitives;
  private readonly operations: T3PreviewOperations;
  private readonly defineActions: DefineMidsceneActions;

  constructor(operations: T3PreviewOperations, defineActions: DefineMidsceneActions) {
    this.operations = operations;
    this.defineActions = defineActions;
    const focus = async (target: unknown): Promise<void> => {
      const point = targetPoint(target);
      if (point) await this.operations.click(point);
    };
    this.inputPrimitives = {
      pointer: {
        tap: (point) => this.operations.click(point),
      },
      keyboard: {
        keyboardPress: async (keyName, options) => {
          await focus(options?.target);
          await this.operations.press(parseMidsceneKeyName(keyName));
        },
        typeText: async (value, options) => {
          await focus(options?.target);
          await this.operations.type({ text: value, clear: options?.replace ?? false });
        },
        clearInput: async (target) => {
          await focus(target);
          await this.operations.type({ text: "", clear: true });
        },
      },
      scroll: {
        scroll: async (param) => {
          const viewport = await this.size();
          const rawDistance = param.distance ?? Math.round(viewport.height * 0.8);
          const distance = Math.max(1, Math.abs(rawDistance));
          const boundaryDistance = Math.max(1_000_000, viewport.width * 10, viewport.height * 10);
          const deltas =
            param.scrollType === "scrollToTop"
              ? { deltaX: 0, deltaY: -boundaryDistance }
              : param.scrollType === "scrollToBottom"
                ? { deltaX: 0, deltaY: boundaryDistance }
                : param.scrollType === "scrollToLeft"
                  ? { deltaX: -boundaryDistance, deltaY: 0 }
                  : param.scrollType === "scrollToRight"
                    ? { deltaX: boundaryDistance, deltaY: 0 }
                    : param.direction === "up"
                      ? { deltaX: 0, deltaY: -distance }
                      : param.direction === "left"
                        ? { deltaX: -distance, deltaY: 0 }
                        : param.direction === "right"
                          ? { deltaX: distance, deltaY: 0 }
                          : { deltaX: 0, deltaY: distance };
          const point = targetPoint(param.locate);
          await this.operations.scroll({ ...deltas, ...point });
        },
      },
    };
  }

  async screenshotBase64(): Promise<string> {
    const snapshot = await this.operations.snapshot();
    return `data:image/png;base64,${snapshot.screenshot.data}`;
  }

  async size(): Promise<{ readonly width: number; readonly height: number }> {
    const status = await this.operations.status();
    if (!status.viewport) throw new Error("The T3 preview viewport is unavailable.");
    return status.viewport;
  }

  actionSpace(): DeviceAction[] {
    return [...this.defineActions(this.inputPrimitives)];
  }

  describe(): string {
    return "T3 Code built-in browser preview";
  }
}
