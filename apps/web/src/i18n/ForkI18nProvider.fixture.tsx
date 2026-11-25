import type { ReactNode } from "react";
import { ForkLocaleContext } from "./useForkI18n";

export { useI18n } from "./useForkI18n";

export function I18nProvider({
  children,
  initialLocale,
}: {
  readonly children: ReactNode;
  readonly initialLocale: "en" | "zh-CN";
}) {
  return <ForkLocaleContext value={initialLocale}>{children}</ForkLocaleContext>;
}
