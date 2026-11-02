import { useI18n } from "../../i18n";
import { WizardSteps } from "../ui/wizard";
import {
  ADD_PROVIDER_WIZARD_STEPS,
  resolveWizardNavigation,
  type WizardNavigation,
} from "./AddProviderInstanceDialog.logic";

function localizeWizardStep(step: string, t: ReturnType<typeof useI18n>["t"]): string {
  switch (step) {
    case "Provider":
      return t("providers.driver");
    case "Identity":
      return t("providers.identity");
    case "Config":
      return t("providers.config");
    default:
      return step;
  }
}

interface AddProviderInstanceWizardStepsProps {
  readonly currentStep: number;
  readonly summaries: readonly (string | null)[];
  readonly instanceIdError: string | null;
  readonly steps?: readonly string[];
  readonly identityStep?: number;
  readonly prerequisite?: {
    readonly step: number;
    readonly error: string | null;
  };
  readonly onNavigation: (navigation: WizardNavigation) => void;
  readonly disabled?: boolean;
}

export function AddProviderInstanceWizardSteps({
  currentStep,
  summaries,
  instanceIdError,
  steps = ADD_PROVIDER_WIZARD_STEPS,
  identityStep,
  prerequisite,
  onNavigation,
  disabled = false,
}: AddProviderInstanceWizardStepsProps) {
  const { t } = useI18n();
  return (
    <WizardSteps
      steps={steps.map((step) => localizeWizardStep(step, t))}
      currentStep={currentStep}
      summaries={summaries}
      isStepDisabled={() => disabled}
      onStepChange={(requestedStep) =>
        onNavigation(
          resolveWizardNavigation(currentStep, requestedStep, steps.length, {
            instanceIdError,
            ...(identityStep === undefined ? {} : { identityStep }),
            ...(prerequisite === undefined ? {} : { prerequisite }),
          }),
        )
      }
    />
  );
}
