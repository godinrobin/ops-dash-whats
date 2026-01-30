import { useState, useEffect } from "react";
import { CreditCard, ToggleRight, Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/useSplashedToast";

export function AutoRenewalIndicator() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [hasSavedCard, setHasSavedCard] = useState(false);
  const [autoRenewalEnabled, setAutoRenewalEnabled] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    
    const checkStatus = async () => {
      try {
        // Check for saved cards
        const { data: methodsData } = await supabase.functions.invoke('manage-payment-methods', {
          body: { action: 'list' },
        });
        
        const hasCards = methodsData?.methods?.length > 0;
        setHasSavedCard(hasCards);

        // Check auto-renewal setting
        const { data: profile } = await supabase
          .from('profiles')
          .select('auto_renewal_enabled')
          .eq('id', user.id)
          .single();
        
        setAutoRenewalEnabled(profile?.auto_renewal_enabled !== false);
      } catch (error) {
        console.error('Error checking auto-renewal status:', error);
      } finally {
        setLoading(false);
      }
    };

    checkStatus();
  }, [user]);

  if (loading || !hasSavedCard || !autoRenewalEnabled) {
    return null;
  }

  const handleToggleClick = () => {
    toast({ 
      title: 'Para desativar a renovação automática, acesse Configurações > Pagamentos',
    });
    navigate('/settings');
  };

  return (
    <div className="mt-3 p-3 rounded-lg border border-green-500/30 bg-green-500/10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-green-500" />
          <span className="text-sm text-green-400">
            Renovação automática ativa
          </span>
        </div>
        <button
          onClick={handleToggleClick}
          className="flex items-center gap-1 text-green-500 hover:text-green-400 transition-colors"
        >
          <ToggleRight className="h-5 w-5" />
        </button>
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        Suas instâncias serão renovadas automaticamente via cartão cadastrado.
      </p>
    </div>
  );
}
