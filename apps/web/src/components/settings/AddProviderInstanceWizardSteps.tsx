import { WizardSteps } from "../ui/wizard";
import {
  ADD_PROVIDER_WIZARD_STEPS,
  resolveWizardNavigation,
  type WizardNavigation,
} from "./AddProviderInstanceDialog.logic";
import { useI18n } from "../../i18n";

interface AddProviderInstanceWizardStepsProps {
  readonly currentStep: number;
  readonly summaries: readonly (string | null)[];
  readonly instanceIdError: string | null;
  readonly onNavigation: (navigation: WizardNavigation) => void;
}

export function AddProviderInstanceWizardSteps({
  currentStep,
  summaries,
  instanceIdError,
  onNavigation,
}: AddProviderInstanceWizardStepsProps) {
  const { t } = useI18n();
  return (
    <WizardSteps
      steps={[t("providers.driver"), t("providers.identity"), t("providers.config")]}
      currentStep={currentStep}
      summaries={summaries}
      onStepChange={(requestedStep) =>
        onNavigation(
          resolveWizardNavigation(currentStep, requestedStep, ADD_PROVIDER_WIZARD_STEPS.length, {
            instanceIdError,
          }),
        )
      }
    />
  );
}
