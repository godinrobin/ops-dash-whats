import { useState, ReactNode } from "react";
import { useCreditsSystem } from "@/hooks/useCreditsSystem";
import { useCredits } from "@/hooks/useCredits";
import { useAccessLevel } from "@/hooks/useAccessLevel";
import { InsufficientCreditsModal } from "./InsufficientCreditsModal";

interface CreditGatedActionProps {
  /** Credit cost for this action */
  creditCost: number;
  /** System ID for transaction logging */
  systemId: string;
  /** Description for transaction */
  description: string;
  /** The action to execute if credits are available */
  onAction: () => Promise<void> | void;
  /** Children render prop with trigger function */
  children: (props: { 
    execute: () => Promise<void>; 
    isProcessing: boolean;
    creditCost: number;
    isActive: boolean;
  }) => ReactNode;
  /** Skip credit check for full members (within free tier) */
  skipForFullMember?: boolean;
  /** Custom check before deducting credits */
  customFreeTierCheck?: () => boolean;
}

/**
 * Wrapper component that handles credit deduction before executing an action.
 * Shows insufficient credits modal if user doesn't have enough credits.
 */
export const CreditGatedAction = ({
  creditCost,
  systemId,
  description,
  onAction,
  children,
  skipForFullMember = false,
  customFreeTierCheck,
}: CreditGatedActionProps) => {
  const { isActive } = useCreditsSystem();
  const { deductCredits, canAfford } = useCredits();
  const { isFullMember } = useAccessLevel();
  const [isProcessing, setIsProcessing] = useState(false);
  const [showInsufficientModal, setShowInsufficientModal] = useState(false);

  const execute = async () => {
    // If credits system is not active, just run the action
    if (!isActive) {
      setIsProcessing(true);
      try {
        await onAction();
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    // Check if full member should skip credit deduction
    const shouldSkip = skipForFullMember && isFullMember;
    const isInFreeTier = customFreeTierCheck ? customFreeTierCheck() : false;

    if (shouldSkip || isInFreeTier) {
      setIsProcessing(true);
      try {
        await onAction();
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    // Check if user can afford
    if (!canAfford(creditCost)) {
      setShowInsufficientModal(true);
      return;
    }

    setIsProcessing(true);
    try {
      // Deduct credits first
      const success = await deductCredits(creditCost, systemId, description);
      if (!success) {
        setShowInsufficientModal(true);
        return;
      }

      // Execute the action
      await onAction();
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      {children({ execute, isProcessing, creditCost, isActive })}
      <InsufficientCreditsModal
        open={showInsufficientModal}
        onOpenChange={setShowInsufficientModal}
        requiredCredits={creditCost}
        systemName={systemId}
      />
    </>
  );
};
