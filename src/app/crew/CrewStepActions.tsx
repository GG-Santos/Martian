import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "../../components/ui/button";

type CrewStepActionsProps = {
  backLabel: string;
  continueLabel: string;
  onBack: () => void;
  onContinue: () => void;
  disabled?: boolean;
  busy?: boolean;
  className?: string;
};

export function CrewStepActions({
  backLabel,
  continueLabel,
  onBack,
  onContinue,
  disabled = false,
  busy = false,
  className = "",
}: CrewStepActionsProps) {
  return (
    <footer className={`crew-character-step-actions ${className}`.trim()}>
      <Button className="crew-choice-back" type="button" variant="ghost" onClick={onBack}>
        <ArrowLeft size={16} aria-hidden="true" />
        <span>{backLabel}</span>
      </Button>
      <Button type="button" disabled={disabled || busy} onClick={onContinue}>
        {busy ? `${continueLabel}…` : continueLabel}
        <ArrowRight size={16} aria-hidden="true" />
      </Button>
    </footer>
  );
}
