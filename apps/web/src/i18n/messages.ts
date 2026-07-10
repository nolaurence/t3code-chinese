import type { Locale } from "./locale";

type MessageCatalog = Readonly<Record<string, string>>;
export type TranslateValues = Readonly<Record<string, string | number>>;

function defineMessages<const English extends MessageCatalog>(
  en: English,
  zhCN: { readonly [Key in keyof English]: string },
) {
  return { en, "zh-CN": zhCN } as const;
}

const common = defineMessages(
  {
    "common.cancel": "Cancel",
    "common.files": "{count} files",
    "common.save": "Save",
  },
  {
    "common.cancel": "取消",
    "common.files": "{count} 个文件",
    "common.save": "保存",
  },
);

const messages = {
  en: { ...common.en },
  "zh-CN": { ...common["zh-CN"] },
} as const;

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
