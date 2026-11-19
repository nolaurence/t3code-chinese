import { createContext, use, useEffect, useState, type ReactElement, type ReactNode } from "react";

import {
  DEFAULT_LOCALE,
  readLocalePreference,
  syncDocumentLocale,
  writeLocalePreference,
  type Locale,
} from "./locale";
import { createTranslator, type Translate } from "./messages";

export interface I18nValue {
  readonly locale: Locale;
  readonly setLocale: (locale: Locale) => void;
  readonly t: Translate;
}

const DEFAULT_I18N_VALUE: I18nValue = {
  locale: DEFAULT_LOCALE,
  setLocale: () => undefined,
  t: createTranslator(DEFAULT_LOCALE),
};

const I18nContext = createContext<I18nValue>(DEFAULT_I18N_VALUE);

export function I18nProvider({
  children,
  initialLocale,
}: {
  readonly children: ReactNode;
  readonly initialLocale?: Locale;
}): ReactElement {
  const [locale, setLocaleState] = useState<Locale>(() => initialLocale ?? readLocalePreference());

  const setLocale = (nextLocale: Locale) => {
    setLocaleState(nextLocale);
    syncDocumentLocale(nextLocale);
    writeLocalePreference(nextLocale);
    // Breaks the toast -> I18nProvider -> GT runtime -> useSettings -> toast import cycle.
    void import("./runtime").then(({ persistGTLocale }) => {
      persistGTLocale(nextLocale === "zh-CN" ? "zh" : "en");
    });
  };

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- keeps document.lang in step with the provider locale.
  useEffect(() => {
    syncDocumentLocale(locale);
  }, [locale]);

  const value: I18nValue = { locale, setLocale, t: createTranslator(locale) };

  return <I18nContext value={value}>{children}</I18nContext>;
}

export function useI18n(): I18nValue {
  return use(I18nContext);
}

export function I18nText({
  children,
}: {
  readonly children: (t: Translate) => ReactNode;
}): ReactElement {
  const { t } = useI18n();
  return <>{children(t)}</>;
}
