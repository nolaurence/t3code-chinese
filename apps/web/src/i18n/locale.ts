export type Locale = "en" | "zh-CN";

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_STORAGE_KEY = "t3code:locale";

type LocaleReadStorage = Pick<Storage, "getItem">;
type LocaleWriteStorage = Pick<Storage, "setItem">;
type DocumentLanguageTarget = {
  readonly documentElement: {
    lang: string;
  };
};

export function parseLocale(value: unknown): Locale {
  return value === "zh-CN" ? "zh-CN" : DEFAULT_LOCALE;
}

function resolveReadStorage(storage?: LocaleReadStorage): LocaleReadStorage | undefined {
  if (storage) return storage;
  return typeof window === "undefined" ? undefined : window.localStorage;
}

function resolveWriteStorage(storage?: LocaleWriteStorage): LocaleWriteStorage | undefined {
  if (storage) return storage;
  return typeof window === "undefined" ? undefined : window.localStorage;
}

export function readLocalePreference(storage?: LocaleReadStorage): Locale {
  try {
    return parseLocale(resolveReadStorage(storage)?.getItem(LOCALE_STORAGE_KEY));
  } catch {
    console.error("Could not read the interface language preference.");
    return DEFAULT_LOCALE;
  }
}

export function writeLocalePreference(locale: Locale, storage?: LocaleWriteStorage): boolean {
  const target = resolveWriteStorage(storage);
  if (!target) return false;

  try {
    target.setItem(LOCALE_STORAGE_KEY, locale);
    return true;
  } catch {
    console.error("Could not persist the interface language preference.");
    return false;
  }
}

export function syncDocumentLocale(
  locale: Locale,
  target: DocumentLanguageTarget | undefined = typeof document === "undefined"
    ? undefined
    : document,
): void {
  if (target) target.documentElement.lang = locale;
}
