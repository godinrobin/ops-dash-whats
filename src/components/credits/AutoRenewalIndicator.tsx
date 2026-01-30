import { useState, useEffect } from "react";
import { CreditCard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function AutoRenewalIndicator() {
  const { user } = useAuth();
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

  // Only show if user has saved card AND auto-renewal is enabled
  if (loading || !hasSavedCard || !autoRenewalEnabled) {
    return null;
  }

  return (
    <div className="mt-3 p-3 rounded-lg border border-zinc-700 bg-zinc-800/50">
      <div className="flex items-center gap-2">
        <CreditCard className="h-4 w-4 text-zinc-300" />
        <span className="text-sm text-white">
          Renovação automática ativa
        </span>
      </div>
      <p className="text-xs text-zinc-400 mt-1">
        Suas instâncias serão renovadas automaticamente via cartão cadastrado.
      </p>
    </div>
  );
}
