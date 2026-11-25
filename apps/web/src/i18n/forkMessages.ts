import type { Locale } from "./locale";
import en from "./forkMessages.en.json";
import zhCN from "./forkMessages.zh-CN.json";

export type TranslateValues = Readonly<Record<string, string | number>>;
const messages = { en, "zh-CN": zhCN };

export type MessageKey = keyof (typeof messages)["en"];
export type Translate = (key: MessageKey, values?: TranslateValues) => string;

function interpolate(template: string, values: TranslateValues | undefined): string {
  if (!values) return template;
  return template.replaceAll(/\{([^{}]+)\}/g, (placeholder, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : placeholder,
  );
}

export function translate(locale: Locale, key: MessageKey, values?: TranslateValues): string {
  const localized = messages[locale][key] ?? messages.en[key];
  return interpolate(localized, values);
}

export function createTranslator(locale: Locale): Translate {
  return (key, values) => translate(locale, key, values);
}
