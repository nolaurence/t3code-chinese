import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { I18nProvider, useI18n } from "./I18nProvider";

function CancelLabel() {
  const { t } = useI18n();
  return <span>{t("common.cancel")}</span>;
}

describe("I18nProvider", () => {
  it("renders English messages", () => {
    const markup = renderToStaticMarkup(
      <I18nProvider initialLocale="en">
        <CancelLabel />
      </I18nProvider>,
    );

    expect(markup).toContain("Cancel");
  });

  it("renders Simplified Chinese messages", () => {
    const markup = renderToStaticMarkup(
      <I18nProvider initialLocale="zh-CN">
        <CancelLabel />
      </I18nProvider>,
    );

    expect(markup).toContain("取消");
  });
});
