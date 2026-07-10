import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  parseLocale,
  readLocalePreference,
  syncDocumentLocale,
  writeLocalePreference,
} from "./locale";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("locale preferences", () => {
  it("accepts only the supported locales", () => {
    expect(parseLocale("en")).toBe("en");
    expect(parseLocale("zh-CN")).toBe("zh-CN");
    expect(parseLocale("fr")).toBe(DEFAULT_LOCALE);
    expect(parseLocale(null)).toBe(DEFAULT_LOCALE);
  });

  it("falls back to English when persisted storage cannot be read", () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const storage = {
      getItem: () => {
        throw new Error("private storage contents");
      },
    };

    expect(readLocalePreference(storage)).toBe("en");
    expect(errorLog).toHaveBeenCalledWith("Could not read the interface language preference.");
  });

  it("persists a supported locale without exposing storage failures", () => {
    const writes: Array<readonly [string, string]> = [];
    expect(
      writeLocalePreference("zh-CN", {
        setItem: (key, value) => writes.push([key, value]),
      }),
    ).toBe(true);
    expect(writes).toEqual([[LOCALE_STORAGE_KEY, "zh-CN"]]);

    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(
      writeLocalePreference("en", {
        setItem: () => {
          throw new Error("private storage contents");
        },
      }),
    ).toBe(false);
    expect(errorLog).toHaveBeenCalledWith("Could not persist the interface language preference.");
  });

  it("synchronizes the document language", () => {
    const target = { documentElement: { lang: "" } };

    syncDocumentLocale("zh-CN", target);

    expect(target.documentElement.lang).toBe("zh-CN");
  });
});
