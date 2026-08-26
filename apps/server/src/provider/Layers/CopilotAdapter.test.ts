import type { PermissionRequest } from "@github/copilot-sdk";
import { describe, expect, it } from "vite-plus/test";

import {
  copilotPermissionDetail,
  copilotPermissionRequestType,
  isCopilotPermissionAllowedInPlanMode,
  selectCopilotRewindPoint,
  shouldAutoApproveCopilotPermission,
} from "./CopilotAdapter.ts";

const shellRequest: PermissionRequest = {
  kind: "shell",
  canOfferSessionApproval: true,
  commands: [],
  fullCommandText: "pnpm test",
  hasWriteFileRedirection: false,
  intention: "Run tests",
  possiblePaths: [],
  possibleUrls: [],
};

const writeRequest: PermissionRequest = {
  kind: "write",
  canOfferSessionApproval: true,
  diff: "+const ready = true;",
  fileName: "src/copilot.ts",
  intention: "Update the integration",
};

const readRequest: PermissionRequest = {
  kind: "read",
  intention: "Inspect the integration",
  path: "src/copilot.ts",
};

const customToolRequest: PermissionRequest = {
  kind: "custom-tool",
  toolDescription: "Run a custom operation",
  toolName: "custom_operation",
};

describe("Copilot permission mapping", () => {
  it("maps current SDK permission discriminators and details", () => {
    expect(copilotPermissionRequestType(shellRequest)).toBe("command_execution_approval");
    expect(copilotPermissionDetail(shellRequest)).toBe("pnpm test");
    expect(copilotPermissionRequestType(writeRequest)).toBe("file_change_approval");
    expect(copilotPermissionDetail(writeRequest)).toBe("write: src/copilot.ts");
    expect(copilotPermissionRequestType(customToolRequest)).toBe("dynamic_tool_call");
  });

  it("honors runtime modes without bypassing managed approvals", () => {
    expect(shouldAutoApproveCopilotPermission(shellRequest, "full-access")).toBe(true);
    expect(shouldAutoApproveCopilotPermission(writeRequest, "auto-accept-edits")).toBe(true);
    expect(shouldAutoApproveCopilotPermission(readRequest, "auto-accept-edits")).toBe(false);
    expect(
      shouldAutoApproveCopilotPermission(
        { ...writeRequest, managedApprovalRequired: true },
        "full-access",
      ),
    ).toBe(false);
  });

  it("allows only read-only permission kinds in plan mode", () => {
    expect(isCopilotPermissionAllowedInPlanMode(readRequest)).toBe(true);
    expect(isCopilotPermissionAllowedInPlanMode(writeRequest)).toBe(false);
    expect(isCopilotPermissionAllowedInPlanMode(shellRequest)).toBe(false);
  });
});

describe("Copilot rewind selection", () => {
  it("selects the SDK rewind point at the requested turn boundary", () => {
    const points = ["first", "second", "third"];
    expect(selectCopilotRewindPoint(points, 1)).toBe("third");
    expect(selectCopilotRewindPoint(points, 2)).toBe("second");
    expect(selectCopilotRewindPoint(points, 4)).toBeUndefined();
  });
});
