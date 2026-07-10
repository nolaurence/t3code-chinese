import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { I18nProvider } from "../i18n/I18nProvider";
import { NoActiveThreadState } from "./NoActiveThreadState";

describe("NoActiveThreadState", () => {
  it("renders the Simplified Chinese empty state", () => {
    const markup = renderToStaticMarkup(
      <I18nProvider initialLocale="zh-CN">
        <NoActiveThreadState />
      </I18nProvider>,
    );

    expect(markup).toContain("没有活动任务");
    expect(markup).toContain("选择一个任务以继续");
    expect(markup).toContain("选择现有任务或新建任务即可开始");
  });
});
