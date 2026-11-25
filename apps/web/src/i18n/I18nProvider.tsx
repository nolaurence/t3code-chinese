import { GTProvider } from "gt-react";
import { useSyncExternalStore, type ReactNode } from "react";

import { getI18nSnapshot, persistGTLocale, subscribeI18n } from "./runtime";

import { ForkLocaleContext } from "./useForkI18n";

const reloadToSetting = (state: { readonly locale: string }) => persistGTLocale(state.locale);

export function I18nProvider({ children }: { readonly children: ReactNode }) {
  const { locale, translations } = useSyncExternalStore(subscribeI18n, getI18nSnapshot);
  return (
    <GTProvider locale={locale} translations={translations} _reload={reloadToSetting}>
      <ForkLocaleContext value={locale === "zh" ? "zh-CN" : "en"}>{children}</ForkLocaleContext>
    </GTProvider>
  );
}
