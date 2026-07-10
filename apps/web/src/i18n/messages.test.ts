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
});
