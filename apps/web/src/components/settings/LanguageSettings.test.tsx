import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { I18nProvider } from "../../i18n/I18nProvider";
import {
  LANGUAGE_OPTIONS,
  LanguageSettings,
  applyLanguageSelection,
  isDefaultLocalePreference,
} from "./LanguageSettings";

describe("LanguageSettings", () => {
  it("renders the English setting copy", () => {
    const markup = renderToStaticMarkup(
      <I18nProvider initialLocale="en">
        <LanguageSettings />
      </I18nProvider>,
    );

    expect(markup).toContain("Interface language");
    expect(markup).toContain("English");
  });

  it("renders the Simplified Chinese setting copy", () => {
    const markup = renderToStaticMarkup(
      <I18nProvider initialLocale="zh-CN">
        <LanguageSettings />
      </I18nProvider>,
    );

    expect(markup).toContain("界面语言");
    expect(markup).toContain("简体中文");
  });

  it("exposes only the two supported locale values", () => {
    expect(LANGUAGE_OPTIONS.map((option) => option.value)).toEqual(["en", "zh-CN"]);
  });

  it("applies only supported locale selections", () => {
    const setLocale = vi.fn();

    applyLanguageSelection("zh-CN", setLocale);
    applyLanguageSelection("fr", setLocale);

    expect(setLocale).toHaveBeenCalledOnce();
    expect(setLocale).toHaveBeenCalledWith("zh-CN");
  });

  it("reports whether the locale preference uses its default", () => {
    expect(isDefaultLocalePreference("en")).toBe(true);
    expect(isDefaultLocalePreference("zh-CN")).toBe(false);
  });
});
