import { Coins } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useCreditsSystem } from "@/hooks/useCreditsSystem";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface SystemCreditBadgeProps {
  /** Credit cost per action */
  creditCost: number;
  /** Suffix text (e.g., "por geração", "por análise") */
  suffix?: string;
  /** Show free tier info */
  freeTierInfo?: string;
  /** Whether user is in free tier */
  isInFreeTier?: boolean;
}

/**
 * Badge that shows credit cost for a system action.
 * Only visible when credits system is active.
 */
export const SystemCreditBadge = ({
  creditCost,
  suffix = "por uso",
  freeTierInfo,
  isInFreeTier = false,
}: SystemCreditBadgeProps) => {
  const { isActive } = useCreditsSystem();

  if (!isActive) return null;

  if (isInFreeTier && freeTierInfo) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="border-green-500/50 text-green-500 gap-1">
              <Coins className="h-3 w-3" />
              Grátis
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>{freeTierInfo}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="border-accent/50 text-accent gap-1">
            <Coins className="h-3 w-3" />
            {creditCost.toFixed(2)} {suffix}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>Cada {suffix.replace("por ", "")} custa {creditCost.toFixed(2)} créditos</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
