import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  Facebook, 
  Plus, 
  Trash2, 
  Check, 
  RefreshCcw,
  ExternalLink,
  Building2,
  LogOut,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { splashedToast } from "@/hooks/useSplashedToast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface FacebookAccount {
  id: string;
  facebook_user_id: string;
  name?: string;
  email?: string;
  profile_pic_url?: string;
  token_expires_at?: string;
  created_at: string;
}

interface AdAccount {
  id: string;
  ad_account_id: string;
  name?: string;
  currency: string;
  account_status: number;
  is_selected: boolean;
  facebook_account_id: string;
}

export default function AdsSettings() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [facebookAccounts, setFacebookAccounts] = useState<FacebookAccount[]>([]);
  const [adAccounts, setAdAccounts] = useState<AdAccount[]>([]);
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());
  const [syncingAccounts, setSyncingAccounts] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  // Handle OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    
    if (code) {
      handleOAuthCallback(code);
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Load Facebook accounts
      const { data: fbAccounts } = await supabase
        .from("ads_facebook_accounts")
        .select("*")
        .eq("user_id", user.id);

      setFacebookAccounts(fbAccounts || []);

      // Load Ad accounts
      const { data: adAccountsData } = await supabase
        .from("ads_ad_accounts")
        .select("*")
        .eq("user_id", user.id);

      setAdAccounts(adAccountsData || []);
    } catch (error) {
      console.error("Error loading settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const FACEBOOK_REDIRECT_URI = "https://zapdata.co/";

  const handleConnectFacebook = async () => {
    setConnecting(true);
    try {
      // Facebook OAuth often rejects redirects with fragments (#). We redirect to the site root,
      // then route internally to /#/ads/settings after connecting.
      const redirectUri = FACEBOOK_REDIRECT_URI;

      const { data, error } = await supabase.functions.invoke("facebook-oauth", {
        body: { action: "get_login_url", redirect_uri: redirectUri }
      });

      if (error) throw error;
      if (data?.login_url) {
        window.location.href = data.login_url;
      }
    } catch (error) {
      console.error("Error initiating Facebook login:", error);
      splashedToast.error("Erro ao conectar com Facebook");
      setConnecting(false);
    }
  };

  const handleOAuthCallback = async (code: string) => {
    setConnecting(true);
    try {
      const redirectUri = FACEBOOK_REDIRECT_URI;

      const { data, error } = await supabase.functions.invoke("facebook-oauth", {
        body: { action: "exchange_code", code, redirect_uri: redirectUri }
      });

      if (error) throw error;

      splashedToast.success("Conta do Facebook conectada!");
      await loadData();
    } catch (error) {
      console.error("Error exchanging code:", error);
      splashedToast.error("Erro ao conectar conta");
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnectAccount = async (accountId: string) => {
    try {
      // Delete ad accounts first
      await supabase
        .from("ads_ad_accounts")
        .delete()
        .eq("facebook_account_id", accountId);

      // Delete facebook account
      await supabase
        .from("ads_facebook_accounts")
        .delete()
        .eq("id", accountId);

      setFacebookAccounts(prev => prev.filter(a => a.id !== accountId));
      setAdAccounts(prev => prev.filter(a => a.facebook_account_id !== accountId));
      splashedToast.success("Conta desconectada");
    } catch (error) {
      console.error("Error disconnecting:", error);
      splashedToast.error("Erro ao desconectar");
    }
  };

  const handleToggleAdAccount = async (accountId: string, isSelected: boolean) => {
    try {
      await supabase
        .from("ads_ad_accounts")
        .update({ is_selected: isSelected })
        .eq("id", accountId);

      setAdAccounts(prev => prev.map(a => 
        a.id === accountId ? { ...a, is_selected: isSelected } : a
      ));
    } catch (error) {
      console.error("Error toggling account:", error);
      splashedToast.error("Erro ao atualizar");
    }
  };

  const handleSyncAdAccounts = async (facebookAccountId: string) => {
    setSyncingAccounts(prev => new Set(prev).add(facebookAccountId));
    try {
      const { error } = await supabase.functions.invoke("facebook-oauth", {
        body: { action: "get_ad_accounts", facebook_account_id: facebookAccountId }
      });

      if (error) throw error;
      splashedToast.success("Contas de anúncio sincronizadas!");
      await loadData();
    } catch (error) {
      console.error("Error syncing ad accounts:", error);
      splashedToast.error("Erro ao sincronizar");
    } finally {
      setSyncingAccounts(prev => {
        const newSet = new Set(prev);
        newSet.delete(facebookAccountId);
        return newSet;
      });
    }
  };

  const getAccountStatusBadge = (status: number) => {
    switch (status) {
      case 1:
        return <Badge className="bg-green-500/20 text-green-400">Ativa</Badge>;
      case 2:
        return <Badge className="bg-yellow-500/20 text-yellow-400">Desativada</Badge>;
      case 3:
        return <Badge className="bg-red-500/20 text-red-400">Não Verificada</Badge>;
      case 7:
        return <Badge className="bg-orange-500/20 text-orange-400">Pendente</Badge>;
      default:
        return <Badge variant="secondary">Status {status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Configurações</h1>
        <p className="text-muted-foreground">Gerencie suas conexões do Facebook</p>
      </div>

      {/* Facebook Accounts */}
      <Card className="bg-card/50 backdrop-blur border-border/50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Facebook className="h-5 w-5 text-blue-500" />
                Contas do Facebook
              </CardTitle>
              <CardDescription>
                Conecte sua conta do Facebook para acessar os dados de anúncios
              </CardDescription>
            </div>
            <Button onClick={handleConnectFacebook} disabled={connecting}>
              {connecting ? (
                <RefreshCcw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Conectar Facebook
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
            </div>
          ) : facebookAccounts.length === 0 ? (
            <div className="text-center py-8">
              <Facebook className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Nenhuma conta conectada</p>
              <p className="text-sm text-muted-foreground mt-1">
                Conecte sua conta do Facebook para começar
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {facebookAccounts.map((account, index) => (
                <motion.div
                  key={account.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="p-4 rounded-lg border border-border bg-background/50"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      {account.profile_pic_url ? (
                        <img 
                          src={account.profile_pic_url} 
                          alt="" 
                          className="w-12 h-12 rounded-full"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center">
                          <Facebook className="h-6 w-6 text-white" />
                        </div>
                      )}
                      <div>
                        <h3 className="font-medium">{account.name || "Conta Facebook"}</h3>
                        {account.email && (
                          <p className="text-sm text-muted-foreground">{account.email}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSyncAdAccounts(account.id)}
                        disabled={syncingAccounts.has(account.id)}
                      >
                        <RefreshCcw className={cn("h-4 w-4 mr-1", syncingAccounts.has(account.id) && "animate-spin")} />
                        {syncingAccounts.has(account.id) ? "Sincronizando..." : "Sincronizar Contas"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDisconnectAccount(account.id)}
                        className="text-red-400 hover:text-red-500"
                      >
                        <LogOut className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Ad Accounts - Collapsible */}
                  <Collapsible 
                    open={expandedAccounts.has(account.id)} 
                    onOpenChange={(isOpen) => {
                      setExpandedAccounts(prev => {
                        const newSet = new Set(prev);
                        if (isOpen) {
                          newSet.add(account.id);
                        } else {
                          newSet.delete(account.id);
                        }
                        return newSet;
                      });
                    }}
                  >
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" className="w-full justify-between p-2 h-auto">
                        <h4 className="text-sm font-medium flex items-center gap-2">
                          <Building2 className="h-4 w-4" />
                          Contas de Anúncio ({adAccounts.filter(a => a.facebook_account_id === account.id).length})
                        </h4>
                        {expandedAccounts.has(account.id) ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-2 mt-2">
                      {adAccounts
                        .filter(a => a.facebook_account_id === account.id)
                        .map(adAccount => (
                          <div 
                            key={adAccount.id}
                            className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                          >
                            <div className="flex items-center gap-3">
                              <Switch
                                checked={adAccount.is_selected}
                                onCheckedChange={(checked) => handleToggleAdAccount(adAccount.id, checked)}
                                className="data-[state=checked]:bg-green-500 data-[state=unchecked]:bg-red-500 [&>span]:!bg-white"
                              />
                              <div>
                                <p className="text-sm font-medium">
                                  {adAccount.name || adAccount.ad_account_id}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  ID: {adAccount.ad_account_id} • {adAccount.currency}
                                </p>
                              </div>
                            </div>
                            {getAccountStatusBadge(adAccount.account_status)}
                          </div>
                        ))}
                      {adAccounts.filter(a => a.facebook_account_id === account.id).length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          Clique em "Sincronizar Contas" para buscar suas contas de anúncio
                        </p>
                      )}
                    </CollapsibleContent>
                  </Collapsible>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Instructions */}
      <Card className="bg-card/50 backdrop-blur border-border/50">
        <CardHeader>
          <CardTitle className="text-base">Instruções de Configuração</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>1. Clique em "Conectar Facebook" para autorizar o acesso à sua conta.</p>
          <p>2. Após conectar, clique em "Sincronizar Contas" para buscar suas contas de anúncio.</p>
          <p>3. Ative as contas que deseja monitorar usando o toggle.</p>
          <p>4. Os dados das campanhas serão sincronizados automaticamente.</p>
        </CardContent>
      </Card>
    </div>
  );
}
