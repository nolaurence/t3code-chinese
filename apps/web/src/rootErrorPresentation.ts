import type { Translate } from "./i18n/messages";

export function getRootErrorMessage(error: unknown, t: Translate): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  return t("rootError.messageFallback");
}

export function getRootErrorDetails(error: unknown, t: Translate): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return t("rootError.detailsFallback");
  }
}
