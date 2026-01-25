import { useState } from "react";
import { useInstanceSubscription } from "@/hooks/useInstanceSubscription";
import { useCredits } from "@/hooks/useCredits";
import { useCreditsSystem } from "@/hooks/useCreditsSystem";
import { Clock, AlertTriangle, Loader2, RefreshCw, ShoppingCart } from "lucide-react";
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
import { useNavigate } from "react-router-dom";

interface InstanceRenewalTagProps {
  instanceId: string;
}

export const InstanceRenewalTag = ({ instanceId }: InstanceRenewalTagProps) => {
  const { isActive, isAdminTesting, isSimulatingPartial } = useCreditsSystem();
  const { getDaysRemaining, isAboutToExpire, isInstanceFree, renewInstance } = useInstanceSubscription();
  const { balance, canAfford } = useCredits();
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);
  const [renewing, setRenewing] = useState(false);

  // Show tag in any active/test mode
  const showTag = isActive || isAdminTesting || isSimulatingPartial;
  if (!showTag) return null;

  const daysRemaining = getDaysRemaining(instanceId);
  const isFree = isInstanceFree(instanceId);
  const aboutToExpire = isAboutToExpire(instanceId);
  
  // In partial simulation, ALL instances need the tag
  // In admin test, only non-free instances (4th+)
  // Only show if there's a daysRemaining value
  const shouldShowTag = (() => {
    if (isSimulatingPartial) {
      // In partial simulation, all instances show tag
      return daysRemaining !== null;
    }
    
    if (isAdminTesting) {
      // In admin test, only non-free instances show tag
      return !isFree && daysRemaining !== null;
    }
    
    // When system is active, show for non-free with expiration
    return !isFree && daysRemaining !== null;
  })();

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

  const handleGoToMarketplace = () => {
    setShowModal(false);
    navigate('/marketplace?tab=creditos');
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
    if (daysRemaining === 1) return '1 dia';
    if (daysRemaining !== null) return `${daysRemaining} dias`;
    return null;
  };

  const badgeContent = getBadgeContent();
  if (!badgeContent || !shouldShowTag) return null;

  return (
    <>
      <Badge
        variant={getBadgeStyle()}
        className={`cursor-pointer hover:opacity-80 transition-opacity whitespace-nowrap flex-shrink-0 ${
          aboutToExpire ? 'animate-pulse' : ''
        }`}
        onClick={() => setShowModal(true)}
      >
        <Clock className="h-3 w-3 mr-1 flex-shrink-0" />
        <span className="whitespace-nowrap">{badgeContent}</span>
      </Badge>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              {aboutToExpire ? (
                <div className="p-3 rounded-full bg-destructive/20">
                  <AlertTriangle className="h-6 w-6 text-destructive" />
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
              </div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Seu saldo atual:</span>
              <span className={`font-medium ${canRenew ? 'text-green-500' : 'text-destructive'}`}>
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
              <Button 
                variant="outline" 
                onClick={handleGoToMarketplace} 
                className="w-full border-orange-500 text-orange-500 hover:bg-orange-500/10"
              >
                <ShoppingCart className="h-4 w-4 mr-2" />
                Recarregue seu saldo
              </Button>
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