import { Alert, AlertDescription } from "../ui/alert";
import type { AuthSessionState } from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import React, { startTransition, useEffect, useEffectEvent, useRef, useState } from "react";

import { connectPairing } from "../../connection/onboarding";
import {
  peekPairingTokenFromUrl,
  stripPairingTokenFromUrl,
  submitServerAuthCredential,
} from "../../environments/primary";
import { readHostedPairingRequest } from "../../hostedPairing";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { StandalonePage, StandalonePageHeader } from "../ui/standalone-page";
import { useAtomCommand } from "../../state/use-atom-command";

import { createTranslator, readLocalePreference, useI18n, type MessageKey, type TranslateValues } from "~/i18n";

function t(key: MessageKey, values?: TranslateValues): string {
  return createTranslator(readLocalePreference())(key, values);
}


export function PairingPendingSurface() {
  useI18n();

  return (
    <StandalonePage>
      <StandalonePageHeader
        title=t("auth.pairingPending")
        description=t("auth.pairingPendingDescription")
      />
    </StandalonePage>
  );
}

export function PairingRouteSurface({
  auth,
  initialErrorMessage,
  onAuthenticated,
}: {
  auth: AuthSessionState["auth"];
  initialErrorMessage?: string;
  onAuthenticated: () => void;
}) {
  useI18n();

  const [autoPairToken] = useState(peekPairingTokenFromUrl);
  const [credential, setCredential] = useState(autoPairToken ?? "");
  const [errorMessage, setErrorMessage] = useState(initialErrorMessage ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const autoSubmitAttemptedRef = useRef(false);

  const submitCredential = async (nextCredential: string) => {
    setIsSubmitting(true);
    setErrorMessage("");

    const submitError = await submitServerAuthCredential(nextCredential).then(
      () => null,
      (error) => errorMessageFromUnknown(error),
    );

    setIsSubmitting(false);

    if (submitError) {
      setErrorMessage(submitError);
      return;
    }

    startTransition(() => {
      onAuthenticated();
    });
  };

  const handleSubmit = async (event?: React.SubmitEvent<HTMLFormElement>) => {
    event?.preventDefault();
    await submitCredential(credential);
  };

  const autoSubmit = useEffectEvent((token: string) => {
    void submitCredential(token);
  });

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- strips the pairing token from the URL and submits it once when the route carries one
  useEffect(() => {
    if (!autoPairToken || autoSubmitAttemptedRef.current) {
      return;
    }

    autoSubmitAttemptedRef.current = true;
    stripPairingTokenFromUrl();
    autoSubmit(autoPairToken);
  }, [autoPairToken]);

  return (
    <StandalonePage>
      <StandalonePageHeader
        title=t("auth.pairTitle")
        description={describeAuthGate(auth.bootstrapMethods)}
      />

      <form className="mt-6 space-y-4" onSubmit={(event) => void handleSubmit(event)}>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="pairing-token">
            Pairing token
          </label>
          <Input
            id="pairing-token"
            autoCapitalize="none"
            autoComplete="off"
            autoCorrect="off"
            disabled={isSubmitting}
            nativeInput
            onChange={(event) => setCredential(event.currentTarget.value)}
            placeholder=t("auth.pairingPlaceholder")
            spellCheck={false}
            value={credential}
          />
        </div>

        {errorMessage ? (
          <Alert variant="error">
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button disabled={isSubmitting} size="sm" type="submit">
            {isSubmitting ? t("auth.pairing") : t("git.continue")}
          </Button>
          <Button
            disabled={isSubmitting}
            onClick={() => window.location.reload()}
            size="sm"
            variant="outline"
          >
            Reload app
          </Button>
        </div>
      </form>

      <div className="mt-6 rounded-lg border border-border/70 bg-background/55 px-3 py-3 text-xs leading-relaxed text-muted-foreground">
        {describeSupportedMethods(auth.bootstrapMethods)}
      </div>
    </StandalonePage>
  );
}

export function HostedPairingRouteSurface() {
  useI18n();

  const connectPairingEnvironment = useAtomCommand(connectPairing, {
    reportFailure: false,
  });
  const [request] = useState(readHostedPairingRequest);
  const [status, setStatus] = useState<"pairing" | "paired" | "error">(
    request ? "pairing" : "error",
  );
  const [message, setMessage] = useState(
    request
      ? t("auth.connectingBackend")
      : t("auth.pairingMissing"),
  );
  const [canRetry, setCanRetry] = useState(false);
  const submitAttemptedRef = useRef(false);
  const tokenSubmittedRef = useRef(false);

  const submitHostedPairingRequest = async () => {
    if (!request) {
      setStatus("error");
      setMessage(t("auth.pairingMissing"));
      setCanRetry(false);
      return;
    }

    if (tokenSubmittedRef.current) {
      setStatus("error");
      setMessage(t("auth.pairingTokenUsed"));
      setCanRetry(false);
      return;
    }

    setStatus("pairing");
    setMessage(t("auth.connectingBackend"));
    setCanRetry(false);
    tokenSubmittedRef.current = true;

    const result = await connectPairingEnvironment({
      host: request.host,
      pairingCode: request.token,
    });
    if (result._tag === "Success") {
      setStatus("paired");
      setMessage(`${request.label || t("auth.environment")} is saved in this browser.`);
      return;
    }

    tokenSubmittedRef.current = false;
    setStatus("error");
    setCanRetry(true);
    setMessage(
      `${errorMessageFromUnknown(squashAtomCommandFailure(result))} If the backend accepted this one-time token, request a new pairing link before retrying.`,
    );
  };

  const submitOnMount = useEffectEvent(() => {
    void submitHostedPairingRequest();
  });

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- strips the pairing token from the URL and submits the hosted pairing request once on mount
  useEffect(() => {
    if (submitAttemptedRef.current) {
      return;
    }
    submitAttemptedRef.current = true;

    stripPairingTokenFromUrl();
    submitOnMount();
  }, []);

  return (
    <StandalonePage>
      <StandalonePageHeader
        title={
          status === "paired"
            ? t("auth.backendPaired")
            : status === "error"
              ? t("auth.pairingFailed")
              : t("auth.pairingBackend")
        }
        description={message}
      />

      {request ? (
        <div className="mt-5 rounded-lg border border-border/70 bg-background/55 px-3 py-3 text-xs leading-relaxed text-muted-foreground">
          Host: <span className="font-mono text-foreground/80">{request.host}</span>
        </div>
      ) : null}

      {status === "error" ? (
        <Alert variant="error" className="mt-5">
          <AlertDescription>
            Verify the backend is reachable from this browser, supports CORS for hosted clients, and
            is served over HTTPS when opening this page from HTTPS.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-2">
        {status === "pairing" ? (
          <Button disabled size="sm">
            Pairing...
          </Button>
        ) : canRetry ? (
          <Button size="sm" onClick={() => void submitHostedPairingRequest()}>
            Try again
          </Button>
        ) : null}
        {status === "paired" ? (
          <Button size="sm" variant="outline" onClick={() => (window.location.href = "/")}>
            Open app
          </Button>
        ) : null}
      </div>
    </StandalonePage>
  );
}

function errorMessageFromUnknown(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  return t("auth.failed");
}

function describeAuthGate(bootstrapMethods: ReadonlyArray<string>): string {
  if (bootstrapMethods.includes("desktop-bootstrap")) {
    return t("auth.trustedCredential");
  }

  return t("auth.enterPairingToken");
}

function describeSupportedMethods(bootstrapMethods: ReadonlyArray<string>): string {
  if (
    bootstrapMethods.includes("desktop-bootstrap") &&
    bootstrapMethods.includes("one-time-token")
  ) {
    return t("auth.methodsBoth");
  }

  if (bootstrapMethods.includes("desktop-bootstrap")) {
    return t("auth.methodsDesktop");
  }

  return t("auth.methodsToken");
}
