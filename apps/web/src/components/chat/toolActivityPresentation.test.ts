import { describe, expect, it } from "vite-plus/test";

import { createTranslator } from "../../i18n/messages";
import type { WorkLogEntry } from "../../session-logic";
import {
  toolActivityHeading,
  toolGroupSummaryText,
  toolSummaryLabel,
} from "./toolActivityPresentation";

function entry(overrides: Partial<WorkLogEntry> = {}): WorkLogEntry {
  return {
    id: "activity-1",
    createdAt: "2026-07-12T00:00:00.000Z",
    label: "Tool call",
    tone: "tool",
    ...overrides,
  };
}

describe("toolActivityHeading", () => {
  const en = createTranslator("en");
  const zhCN = createTranslator("zh-CN");

  it("localizes structured approval request kinds", () => {
    expect(toolActivityHeading(entry({ requestKind: "file-read" }), zhCN)).toBe("读取文件");
    expect(toolActivityHeading(entry({ requestKind: "file-change" }), zhCN)).toBe("编辑文件");
    expect(toolActivityHeading(entry({ requestKind: "command" }), zhCN)).toBe("运行命令");
  });

  it("localizes structured tool item types", () => {
    expect(toolActivityHeading(entry({ itemType: "command_execution" }), zhCN)).toBe("运行命令");
    expect(toolActivityHeading(entry({ itemType: "file_change" }), zhCN)).toBe("编辑文件");
    expect(toolActivityHeading(entry({ itemType: "web_search" }), zhCN)).toBe("网页搜索");
    expect(toolActivityHeading(entry({ itemType: "image_view" }), zhCN)).toBe("查看图片");
    expect(toolActivityHeading(entry({ itemType: "mcp_tool_call" }), zhCN)).toBe("MCP 工具调用");
    expect(toolActivityHeading(entry({ itemType: "collab_agent_tool_call" }), zhCN)).toBe(
      "子 Agent 任务",
    );
    expect(toolActivityHeading(entry({ itemType: "dynamic_tool_call" }), zhCN)).toBe("工具调用");
  });

  it("uses canonical tool names to distinguish file and search operations", () => {
    expect(toolActivityHeading(entry({ toolTitle: "read" }), zhCN)).toBe("读取文件");
    expect(toolActivityHeading(entry({ toolTitle: "write" }), zhCN)).toBe("写入文件");
    expect(toolActivityHeading(entry({ toolTitle: "edit" }), zhCN)).toBe("编辑文件");
    expect(toolActivityHeading(entry({ toolTitle: "bash" }), zhCN)).toBe("运行命令");
    expect(toolActivityHeading(entry({ toolTitle: "grep" }), zhCN)).toBe("搜索文件");
    expect(toolActivityHeading(entry({ toolTitle: "find" }), zhCN)).toBe("查找文件");
    expect(toolActivityHeading(entry({ toolTitle: "ls" }), zhCN)).toBe("列出目录");
  });

  it("localizes known persisted English headings and lifecycle suffixes", () => {
    expect(toolActivityHeading(entry({ label: "Command run completed" }), zhCN)).toBe("运行命令");
    expect(toolActivityHeading(entry({ label: "Ran command" }), zhCN)).toBe("运行命令");
    expect(toolActivityHeading(entry({ label: "Read File failed" }), zhCN)).toBe("读取文件");
    expect(toolActivityHeading(entry({ label: "Tool call stopped" }), zhCN)).toBe("工具调用");
  });

  it("keeps commands, paths, and unknown extension tool names unchanged", () => {
    expect(
      toolActivityHeading(
        entry({
          label: "custom_extension",
          toolTitle: "custom_extension",
          command: "echo hello",
          detail: "/tmp/example.ts",
        }),
        zhCN,
      ),
    ).toBe("Custom_extension");
  });

  it("keeps the English source labels available", () => {
    expect(toolActivityHeading(entry({ toolTitle: "read" }), en)).toBe("Read file");
    expect(toolActivityHeading(entry({ toolTitle: "bash" }), en)).toBe("Run command");
  });
});

describe("toolSummaryLabel", () => {
  const en = createTranslator("en");
  const zhCN = createTranslator("zh-CN");

  it("phrases command rows with the command itself", () => {
    const commandEntry = entry({ label: "Ran command", command: 'export PATH="/usr/bin:$PATH"' });
    expect(toolSummaryLabel(commandEntry, zhCN, undefined)).toBe(
      '已运行 export PATH="/usr/bin:$PATH"',
    );
    expect(toolSummaryLabel(commandEntry, en, undefined)).toBe('Ran export PATH="/usr/bin:$PATH"');
  });

  it("phrases file rows with their workspace-relative path", () => {
    const readEntry = entry({
      label: "Read file",
      toolTitle: "read",
      changedFiles: ["/repo/src/index.ts"],
    });
    expect(toolSummaryLabel(readEntry, zhCN, "/repo")).toBe("已读取 repo/src/index.ts");
    expect(toolSummaryLabel(readEntry, en, "/repo")).toBe("Read repo/src/index.ts");
  });

  it("falls back to the heading when no target is available", () => {
    expect(toolSummaryLabel(entry({ toolTitle: "grep" }), zhCN, undefined)).toBe("搜索文件");
  });
});

describe("toolGroupSummaryText", () => {
  const en = createTranslator("en");
  const zhCN = createTranslator("zh-CN");
  const command = (id: string): WorkLogEntry =>
    entry({ id, label: "Ran command", command: "vp test" });
  const update = (id: string): WorkLogEntry =>
    entry({
      id,
      label: "Approval requested",
      tone: "info",
      sourceActivityKind: "approval.requested",
    });

  it("localizes update group summaries", () => {
    const entries = [update("u1"), update("u2")];
    expect(toolGroupSummaryText(entries, zhCN)).toBe("收到 2 条更新");
    expect(toolGroupSummaryText(entries, en)).toBe("Received 2 updates");
  });

  it("localizes single-count groups without plural drift", () => {
    const entries = [update("u1")];
    expect(toolGroupSummaryText(entries, en)).toBe("Received 1 update");
    expect(toolGroupSummaryText(entries, zhCN)).toBe("收到 1 条更新");
  });

  it("joins mixed groups with locale punctuation", () => {
    const entries = [
      entry({ id: "r1", label: "Read file", requestKind: "file-read" }),
      command("c1"),
      command("c2"),
    ];
    expect(toolGroupSummaryText(entries, zhCN)).toBe("读取了 1 个文件，运行了 2 条命令");
    expect(toolGroupSummaryText(entries, en)).toBe("Read 1 file and ran 2 commands");
  });
});
