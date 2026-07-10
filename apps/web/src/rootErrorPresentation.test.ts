import { describe, expect, it } from "vite-plus/test";

import { createTranslator } from "./i18n/messages";
import { getRootErrorDetails, getRootErrorMessage } from "./rootErrorPresentation";

describe("root route error presentation", () => {
  it("keeps original errors unchanged", () => {
    const t = createTranslator("zh-CN");
    const error = new Error("provider connection failed");

    expect(getRootErrorMessage(error, t)).toBe("provider connection failed");
    expect(getRootErrorDetails(error, t)).toContain("provider connection failed");
  });

  it("uses translated fallback copy", () => {
    const t = createTranslator("zh-CN");

    expect(getRootErrorMessage({}, t)).toBe("发生了意外的路由错误。");
    expect(getRootErrorDetails(1n, t)).toBe("没有更多错误详情。");
  });
});
