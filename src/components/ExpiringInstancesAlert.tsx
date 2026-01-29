import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, X, Sparkles, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface ExpiringInstance {
  id: string;
  instance_name: string;
  phone_number: string | null;
  expires_at: string;
  days_remaining: number;
}

interface ExpiringInstancesAlertProps {
  // Unique key to track if alert was shown (e.g., "inbox-dashboard", "inbox-chat")
  alertKey: string;
}

export const ExpiringInstancesAlert = ({ alertKey }: ExpiringInstancesAlertProps) => {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [expiringInstances, setExpiringInstances] = useState<ExpiringInstance[]>([]);
  const [doubleCreditsEnabled, setDoubleCreditsEnabled] = useState(false);

  useEffect(() => {
    if (user) {
      checkExpiringInstances();
    }
  }, [user]);

  const checkExpiringInstances = async () => {
    // Storage key to track if alert was dismissed (X button) in this session
    const storageKey = `expiring_instances_dismissed_${alertKey}_${user?.id}`;
    const wasDismissed = sessionStorage.getItem(storageKey);
    
    // Only skip if user explicitly dismissed with X button
    if (wasDismissed) return;

    try {
      // Check if double credits is enabled
      const { data: configData } = await supabase
        .from("credits_system_config")
        .select("value")
        .eq("key", "double_credits_enabled")
        .maybeSingle();
      
      const isDoubleCreditsEnabled = configData?.value === true;
      setDoubleCreditsEnabled(isDoubleCreditsEnabled);

      // Fetch instances expiring within 3 days
      const threeDaysFromNow = new Date();
      threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

      const { data: subscriptions, error } = await supabase
        .from("instance_subscriptions")
        .select(`
          id,
          instance_id,
          expires_at,
          maturador_instances!inner (
            id,
            instance_name,
            phone_number,
            user_id
          )
        `)
        .eq("maturador_instances.user_id", user?.id)
        .not("expires_at", "is", null)
        .lte("expires_at", threeDaysFromNow.toISOString())
        .gt("expires_at", new Date().toISOString());

      if (error) {
        console.error("Error fetching expiring instances:", error);
        return;
      }

      if (!subscriptions || subscriptions.length === 0) return;

      const instances: ExpiringInstance[] = subscriptions.map((sub: any) => {
        const expiresAt = new Date(sub.expires_at);
        const now = new Date();
        const daysRemaining = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
        
        return {
          id: sub.instance_id,
          instance_name: sub.maturador_instances.instance_name,
          phone_number: sub.maturador_instances.phone_number,
          expires_at: sub.expires_at,
          days_remaining: daysRemaining,
        };
      });

      if (instances.length > 0) {
        setExpiringInstances(instances);
        setIsOpen(true);
      }
    } catch (err) {
      console.error("Error checking expiring instances:", err);
    }
  };

  // X button - dismiss for this screen only (stored in sessionStorage)
  const handleDismiss = () => {
    const storageKey = `expiring_instances_dismissed_${alertKey}_${user?.id}`;
    sessionStorage.setItem(storageKey, Date.now().toString());
    setIsOpen(false);
  };

  // "Depois" button - just close, will reappear on page reload
  const handleLater = () => {
    setIsOpen(false);
  };

  const handleRecharge = () => {
    // Navigate to marketplace/credits tab
    window.location.hash = "#/metricas";
    setIsOpen(false);
  };

  if (!isOpen || expiringInstances.length === 0) return null;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-md border-orange-500/50 bg-zinc-950">
        <button
          onClick={handleDismiss}
          className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <X className="h-4 w-4 text-zinc-400" />
          <span className="sr-only">Fechar</span>
        </button>

        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-orange-500">
            <AlertTriangle className="h-5 w-5" />
            Instâncias Expirando!
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Warning message */}
          <div className="flex items-start gap-3 p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg">
            <Clock className="h-5 w-5 text-orange-500 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="text-zinc-200 font-medium">
                Você tem <span className="text-orange-500 font-bold">{expiringInstances.length} instância(s)</span> para vencer nos próximos 3 dias!
              </p>
              <p className="text-zinc-400 mt-1">
                Renove agora para não perder suas conexões e conversas.
              </p>
            </div>
          </div>

          {/* Expiring instances list */}
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {expiringInstances.map((instance) => (
              <div 
                key={instance.id}
                className="flex items-center justify-between p-2 bg-zinc-900/50 rounded-lg border border-zinc-800"
              >
                <div>
                  <p className="text-sm text-zinc-200 font-medium">
                    {instance.instance_name}
                  </p>
                  {instance.phone_number && (
                    <p className="text-xs text-zinc-500">
                      {instance.phone_number}
                    </p>
                  )}
                </div>
                <span className={`text-xs font-medium px-2 py-1 rounded ${
                  instance.days_remaining <= 1 
                    ? "bg-red-500/20 text-red-400" 
                    : "bg-orange-500/20 text-orange-400"
                }`}>
                  {instance.days_remaining === 0 
                    ? "Expira hoje!" 
                    : `${instance.days_remaining} dia(s)`}
                </span>
              </div>
            ))}
          </div>

          {/* Double credits promotion */}
          {doubleCreditsEnabled && (
            <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/30 rounded-lg">
              <Sparkles className="h-5 w-5 text-green-500 flex-shrink-0" />
              <div className="text-sm">
                <p className="text-green-400 font-semibold">
                  Crédito em Dobro Ativo! 🎉
                </p>
                <p className="text-zinc-400 text-xs mt-0.5">
                  Aproveite para recarregar agora e ganhe o dobro de créditos!
                </p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1 border-zinc-700 hover:bg-zinc-800"
              onClick={handleLater}
            >
              Depois
            </Button>
            <Button
              className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
              onClick={handleRecharge}
            >
              Recarregar Créditos
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
