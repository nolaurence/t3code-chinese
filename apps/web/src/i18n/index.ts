export {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  parseLocale,
  readLocalePreference,
  syncDocumentLocale,
  writeLocalePreference,
  type Locale,
} from "./locale";
export {
  createTranslator,
  translate,
  translateCurrent,
  type MessageKey,
  type Translate,
  type TranslateValues,
} from "./messages";
export { I18nText, useI18n, type I18nValue } from "./useForkI18n";
export { localizedConnectionStatusText } from "./connection";
export { localizedSourceControlDiscoveryText } from "./sourceControl";
