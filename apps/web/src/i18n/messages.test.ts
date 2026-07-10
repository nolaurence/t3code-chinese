import { describe, expect, it } from "vite-plus/test";

import { createTranslator, translate } from "./messages";

describe("translated messages", () => {
  it("returns the message for the requested locale", () => {
    expect(translate("en", "common.cancel")).toBe("Cancel");
    expect(translate("zh-CN", "common.cancel")).toBe("取消");
  });

  it("interpolates dynamic values as text", () => {
    expect(translate("zh-CN", "common.files", { count: 2 })).toBe("2 个文件");
  });

  it("creates a translator bound to one locale", () => {
    const t = createTranslator("zh-CN");

    expect(t("common.save")).toBe("保存");
  });

  it("covers the remaining desktop product surfaces", () => {
    const t = createTranslator("zh-CN");

    expect(t("providers.title")).toBe("供应商");
    expect(t("git.commit")).toBe("提交");
    expect(t("terminal.title")).toBe("终端");
    expect(t("preview.refresh")).toBe("刷新");
    expect(t("auth.signIn")).toBe("登录");
    expect(t("connections.title")).toBe("连接");
  });

  it("covers desktop accessibility and contextual action copy", () => {
    const t = createTranslator("zh-CN");

    expect(t("common.close")).toBe("关闭");
    expect(t("common.loading")).toBe("正在加载");
    expect(t("common.remove")).toBe("移除");
    expect(t("common.dismissNotification")).toBe("关闭通知");
    expect(t("sidebar.toggle")).toBe("切换主侧栏");
    expect(t("sidebar.resize")).toBe("调整侧栏宽度");
    expect(t("sidebar.dragToResize")).toBe("拖动以调整侧栏宽度");
    expect(t("chat.scrollToEnd")).toBe("滚动到底部");
    expect(t("chat.image.expandedPreview")).toBe("展开的图片预览");
    expect(t("chat.model.search")).toBe("搜索模型…");
    expect(t("chat.model.new")).toBe("新模型");
    expect(t("chat.panel.toggleTerminal")).toBe("切换终端抽屉");
    expect(t("chat.panel.toggleRight")).toBe("切换右侧面板");
    expect(t("chat.error.dismiss")).toBe("关闭错误提示");
    expect(t("chat.preview.removeAnnotation")).toBe("移除预览标注");
    expect(t("chat.task.toggle")).toBe("切换任务状态");
    expect(t("chat.openIntegratedBrowser")).toBe("在内置浏览器中打开");
    expect(t("chat.openSystemBrowser")).toBe("在系统浏览器中打开");
  });
});
