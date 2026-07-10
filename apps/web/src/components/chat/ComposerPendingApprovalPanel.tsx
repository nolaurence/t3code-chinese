import { memo } from "react";
import { type PendingApproval } from "../../session-logic";
import { useI18n } from "../../i18n/I18nProvider";

interface ComposerPendingApprovalPanelProps {
  approval: PendingApproval;
  pendingCount: number;
}

export const ComposerPendingApprovalPanel = memo(function ComposerPendingApprovalPanel({
  approval,
  pendingCount,
}: ComposerPendingApprovalPanelProps) {
  const { t } = useI18n();
  const approvalSummary =
    approval.requestKind === "command"
      ? t("chat.approval.command")
      : approval.requestKind === "file-read"
        ? t("chat.approval.fileRead")
        : t("chat.approval.fileChange");

  return (
    <div className="px-4 py-3.5 sm:px-5 sm:py-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="uppercase text-sm tracking-[0.2em]">{t("chat.approval.pending")}</span>
        <span className="text-sm font-medium">{approvalSummary}</span>
        {pendingCount > 1 ? (
          <span className="text-xs text-muted-foreground">1/{pendingCount}</span>
        ) : null}
      </div>
    </div>
  );
});
