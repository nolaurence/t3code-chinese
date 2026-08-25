import { describe, expect, it } from "vite-plus/test";

import { createTranslator } from "../../i18n/messages";
import type { WorkLogEntry } from "../../session-logic";
import { toolActivityHeading } from "./toolActivityPresentation";

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
