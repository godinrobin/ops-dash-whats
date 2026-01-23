import { useFreeTierUsage } from "@/hooks/useFreeTierUsage";
import { useCreditsSystem } from "@/hooks/useCreditsSystem";
import { Gift, Coins } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

interface SystemUsageCounterProps {
  systemId: string;
  /** Show in compact mode (badge only) */
  compact?: boolean;
  /** Custom label for the counter */
  label?: string;
}

export const SystemUsageCounter = ({
  systemId,
  compact = false,
  label
}: SystemUsageCounterProps) => {
  const { isActive } = useCreditsSystem();
  const { getUsage, hasFreeTier } = useFreeTierUsage();

  // Don't show if credits system is not active
  if (!isActive) return null;

  const hasFree = hasFreeTier(systemId);
  const { used, limit, canUse } = getUsage(systemId);
  const remaining = Math.max(0, limit - used);

  // No free tier for this user/system
  if (!hasFree || limit === 0) return null;

  const percentage = (used / limit) * 100;

  if (compact) {
    return (
      <Badge
        variant={canUse ? 'secondary' : 'outline'}
        className={`gap-1 ${!canUse ? 'border-amber-500/50 text-amber-500' : ''}`}
      >
        {canUse ? (
          <>
            <Gift className="h-3 w-3" />
            {remaining}/{limit} grátis
          </>
        ) : (
          <>
            <Coins className="h-3 w-3" />
            Usar créditos
          </>
        )}
      </Badge>
    );
  }

  return (
    <div className="space-y-2 p-3 rounded-lg bg-secondary/30">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground flex items-center gap-1">
          <Gift className="h-4 w-4" />
          {label || 'Uso grátis'}
        </span>
        <span className={`font-medium ${canUse ? 'text-green-500' : 'text-amber-500'}`}>
          {remaining}/{limit}
        </span>
      </div>
      
      <Progress value={percentage} className="h-2" />
      
      <p className="text-xs text-muted-foreground">
        {canUse
          ? `Você ainda tem ${remaining} uso${remaining > 1 ? 's' : ''} grátis`
          : 'Limite grátis atingido. Próximos usos serão cobrados em créditos.'
        }
      </p>
    </div>
  );
};
