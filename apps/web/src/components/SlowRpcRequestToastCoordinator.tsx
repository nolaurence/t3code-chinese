import { type SlowRpcAckRequest, subscribeSlowRpcAckRequests } from "../rpc/requestLatencyState";
import { createTranslator, readLocalePreference, useI18n } from "~/i18n";
import { toastManager } from "./ui/toast";

function describeSlowRequests(requests: ReadonlyArray<SlowRpcAckRequest>): string {
  const t = createTranslator(readLocalePreference());
  const count = requests.length;
  const thresholdSeconds = Math.round(
    Math.min(...requests.map((request) => request.thresholdMs)) / 1000,
  );

  return t(count === 1 ? "slowRequests.waitingOne" : "slowRequests.waitingMany", {
    count,
    seconds: thresholdSeconds,
  });
}

function SlowRequestDetails({ requests }: { requests: ReadonlyArray<SlowRpcAckRequest> }) {
  const { t } = useI18n();
  return (
    <ul className="space-y-2.5 text-xs text-muted-foreground">
      {requests.map((request) => (
        <li
          className="min-w-0 border-border/50 border-b pb-2 last:border-b-0 last:pb-0"
          key={request.requestId}
        >
          <div className="wrap-break-word font-medium text-foreground">{request.tag}</div>
          <div className="mt-0.5 text-3xs opacity-75">
            {t("slowRequests.startedAt", { time: new Date(request.startedAt).toLocaleTimeString() })}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** One warning toast that tracks the set of slow requests while any are outstanding. */
export function startSlowRpcRequestToasts(): () => void {
  let toastId: ReturnType<typeof toastManager.add> | null = null;

  const unsubscribe = subscribeSlowRpcAckRequests((slowRequests) => {
    if (slowRequests.length === 0) {
      if (toastId !== null) {
        toastManager.close(toastId);
        toastId = null;
      }
      return;
    }

    const t = createTranslator(readLocalePreference());
    const nextToast = {
      data: {
        expandableContent: <SlowRequestDetails requests={slowRequests} />,
        expandableDescriptionTrigger: true,
        expandableLabels: { collapse: t("slowRequests.hide"), expand: t("slowRequests.show") },
      },
      description: describeSlowRequests(slowRequests),
      timeout: 0,
      title: t("slowRequests.title"),
      type: "warning" as const,
    };

    if (toastId === null) {
      toastId = toastManager.add(nextToast);
    } else {
      toastManager.update(toastId, nextToast);
    }
  });

  return () => {
    unsubscribe();
    if (toastId !== null) toastManager.close(toastId);
  };
}
