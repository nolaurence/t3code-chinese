import { describe, expect, it } from "vite-plus/test";

import { createTranslator } from "./messages";
import { localizedConnectionStatusText } from "./connection";

describe("localizedConnectionStatusText", () => {
  const t = createTranslator("zh-CN");

  it("translates stable connection phases", () => {
    expect(
      localizedConnectionStatusText({ phase: "available", error: null, traceId: null }, t),
    ).toBe("可用");
    expect(localizedConnectionStatusText({ phase: "offline", error: null, traceId: null }, t)).toBe(
      "离线",
    );
    expect(
      localizedConnectionStatusText({ phase: "connecting", error: null, traceId: null }, t),
    ).toBe("正在连接…");
    expect(
      localizedConnectionStatusText({ phase: "connected", error: null, traceId: null }, t),
    ).toBe("已连接");
  });

  it("keeps the raw failure reason while translating its surrounding copy", () => {
    expect(
      localizedConnectionStatusText(
        { phase: "reconnecting", error: "ECONNREFUSED", traceId: null },
        t,
      ),
    ).toBe("连接失败，正在重连… 原因：ECONNREFUSED");
    expect(
      localizedConnectionStatusText({ phase: "error", error: "Access denied", traceId: null }, t),
    ).toBe("连接失败。原因：Access denied");
  });
});
