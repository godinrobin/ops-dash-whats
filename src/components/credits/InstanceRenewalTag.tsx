import { useState } from "react";
import { useInstanceSubscription } from "@/hooks/useInstanceSubscription";
import { useCredits } from "@/hooks/useCredits";
import { useCreditsSystem } from "@/hooks/useCreditsSystem";
import { Clock, AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface InstanceRenewalTagProps {
  instanceId: string;
}

export const InstanceRenewalTag = ({ instanceId }: InstanceRenewalTagProps) => {
  const { isActive } = useCreditsSystem();
  const { getDaysRemaining, isAboutToExpire, isInstanceFree, renewInstance } = useInstanceSubscription();
  const { balance, canAfford, creditsToReais } = useCredits();
  const [showModal, setShowModal] = useState(false);
  const [renewing, setRenewing] = useState(false);

  // Don't show if credits system is not active
  if (!isActive) return null;

  const daysRemaining = getDaysRemaining(instanceId);
  const isFree = isInstanceFree(instanceId);
  const aboutToExpire = isAboutToExpire(instanceId);
  
  // Free instances without expiration don't show tag
  if (isFree && daysRemaining === null) return null;

  const RENEWAL_COST = 6;
  const canRenew = canAfford(RENEWAL_COST);

  const handleRenew = async () => {
    setRenewing(true);
    try {
      const success = await renewInstance(instanceId);
      if (success) {
        toast.success('Instância renovada por mais 30 dias!');
        setShowModal(false);
      } else {
        toast.error('Erro ao renovar. Verifique seu saldo.');
      }
    } catch (error) {
      toast.error('Erro inesperado. Tente novamente.');
    } finally {
      setRenewing(false);
    }
  };

  // Determine badge style
  const getBadgeStyle = () => {
    if (daysRemaining === null) return 'default';
    if (daysRemaining === 0) return 'destructive';
    if (daysRemaining <= 3) return 'destructive';
    if (daysRemaining <= 7) return 'outline';
    return 'secondary';
  };

  const getBadgeContent = () => {
    if (daysRemaining === 0) return 'Expira hoje!';
    if (daysRemaining === 1) return '1 dia restante';
    if (daysRemaining !== null) return `${daysRemaining} dias`;
    return null;
  };

  const badgeContent = getBadgeContent();
  if (!badgeContent) return null;

  return (
    <>
      <Badge
        variant={getBadgeStyle()}
        className={`cursor-pointer hover:opacity-80 transition-opacity ${
          aboutToExpire ? 'animate-pulse' : ''
        }`}
        onClick={() => setShowModal(true)}
      >
        <Clock className="h-3 w-3 mr-1" />
        {badgeContent}
      </Badge>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              {aboutToExpire ? (
                <div className="p-3 rounded-full bg-red-500/20">
                  <AlertTriangle className="h-6 w-6 text-red-500" />
                </div>
              ) : (
                <div className="p-3 rounded-full bg-accent/20">
                  <RefreshCw className="h-6 w-6 text-accent" />
                </div>
              )}
              <DialogTitle className="text-xl">
                {aboutToExpire ? 'Instância Expirando!' : 'Renovar Instância'}
              </DialogTitle>
            </div>
            <DialogDescription>
              {aboutToExpire
                ? 'Esta instância está prestes a expirar. Renove para manter seu número ativo.'
                : 'Renove sua instância para continuar usando por mais 30 dias.'
              }
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="p-4 rounded-lg bg-secondary/50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Custo de renovação</p>
                  <p className="text-2xl font-bold">{RENEWAL_COST} <span className="text-sm font-normal">créditos</span></p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Equivalente a</p>
                  <p className="text-lg font-semibold text-accent">{creditsToReais(RENEWAL_COST)}</p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Seu saldo atual:</span>
              <span className={`font-medium ${canRenew ? 'text-green-500' : 'text-red-500'}`}>
                {balance.toFixed(2)} créditos
              </span>
            </div>

            {daysRemaining !== null && (
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-500" />
                  <span className="text-sm">
                    {daysRemaining === 0
                      ? 'Esta instância expira hoje!'
                      : `Restam ${daysRemaining} dia${daysRemaining > 1 ? 's' : ''} de uso`
                    }
                  </span>
                </div>
              </div>
            )}

            {!canRenew && (
              <p className="text-sm text-red-500 text-center">
                Saldo insuficiente. Compre mais créditos no Marketplace.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Button
              onClick={handleRenew}
              disabled={!canRenew || renewing}
              className="w-full bg-accent hover:bg-accent/90"
            >
              {renewing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Renovando...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Renovar por 30 dias
                </>
              )}
            </Button>
            <Button variant="ghost" onClick={() => setShowModal(false)} className="w-full">
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
