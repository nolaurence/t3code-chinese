import { createContext, use, useMemo, type ReactNode } from "react";
import { createTranslator, type Translate } from "./forkMessages";
import type { Locale } from "./locale";

export const ForkLocaleContext = createContext<Locale>("en");

export interface I18nValue {
  readonly locale: Locale;
  readonly t: Translate;
}

export function useI18n(): I18nValue {
  const locale = use(ForkLocaleContext);
  return useMemo(
    () => ({
      locale,
      t: createTranslator(locale),
    }),
    [locale],
  );
}

export function I18nText({ children }: { readonly children: (t: Translate) => ReactNode }) {
  return <>{children(useI18n().t)}</>;
}
