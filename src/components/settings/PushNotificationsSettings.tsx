import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/useSplashedToast";
import { Bell, Trash2, Plus, ExternalLink, Send, Search, Save, Loader2 } from "lucide-react";
import { ColoredSwitch } from "@/components/ui/colored-switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { testPushNotification } from "@/utils/pushNotifications";

export function PushNotificationsSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [pushWebhookEnabled, setPushWebhookEnabled] = useState(false);
  const [pushSubscriptionIds, setPushSubscriptionIds] = useState<string[]>([]);
  const [newSubscriptionId, setNewSubscriptionId] = useState("");
  const [savingPushSettings, setSavingPushSettings] = useState(false);
  const [testingPush, setTestingPush] = useState(false);
  const [notifyOnSale, setNotifyOnSale] = useState(false);
  const [notifyOnDisconnect, setNotifyOnDisconnect] = useState(false);
  const [notifyOnLeadRotation, setNotifyOnLeadRotation] = useState(false);
  const [leadRotationLimit, setLeadRotationLimit] = useState<number>(30);
  const [originalLeadRotationLimit, setOriginalLeadRotationLimit] = useState<number>(30);
  const [checkingLeadRotation, setCheckingLeadRotation] = useState(false);
  const [savingLeadLimit, setSavingLeadLimit] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSettings = async () => {
      if (!user) return;
      
      const { data } = await supabase
        .from("profiles")
        .select("push_webhook_enabled, push_subscription_ids, notify_on_sale, notify_on_disconnect, notify_on_lead_rotation, lead_rotation_limit")
        .eq("id", user.id)
        .single();
      
      if (data) {
        setPushWebhookEnabled(data.push_webhook_enabled || false);
        setPushSubscriptionIds(data.push_subscription_ids || []);
        setNotifyOnSale(data.notify_on_sale || false);
        setNotifyOnDisconnect(data.notify_on_disconnect || false);
        setNotifyOnLeadRotation(data.notify_on_lead_rotation || false);
        setLeadRotationLimit(data.lead_rotation_limit || 30);
        setOriginalLeadRotationLimit(data.lead_rotation_limit || 30);
      }
      setLoading(false);
    };

    fetchSettings();
  }, [user]);

  const handleTogglePushEnabled = async () => {
    if (!user) return;
    setSavingPushSettings(true);
    
    try {
      const newValue = !pushWebhookEnabled;
      const { error } = await supabase
        .from("profiles")
        .update({ push_webhook_enabled: newValue })
        .eq("id", user.id);
      
      if (error) throw error;
      
      setPushWebhookEnabled(newValue);
      toast({
        title: newValue ? "Notificações ativadas!" : "Notificações desativadas",
        description: newValue 
          ? "Você receberá notificações push" 
          : "Você não receberá mais notificações push",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: error.message || "Não foi possível alterar as configurações",
      });
    } finally {
      setSavingPushSettings(false);
    }
  };

  const handleToggleNotifyOnSale = async (checked: boolean) => {
    if (!user) return;
    setSavingPushSettings(true);
    
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ notify_on_sale: checked })
        .eq("id", user.id);
      
      if (error) throw error;
      
      setNotifyOnSale(checked);
      toast({
        title: checked ? "🔔 Notificações de vendas ativadas!" : "Notificações de vendas desativadas",
      });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erro", description: error.message });
    } finally {
      setSavingPushSettings(false);
    }
  };

  const handleToggleNotifyOnDisconnect = async (checked: boolean) => {
    if (!user) return;
    setSavingPushSettings(true);
    
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ notify_on_disconnect: checked })
        .eq("id", user.id);
      
      if (error) throw error;
      
      setNotifyOnDisconnect(checked);
      toast({
        title: checked ? "🚨 Alertas de instâncias ativados!" : "Alertas de instâncias desativados",
      });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erro", description: error.message });
    } finally {
      setSavingPushSettings(false);
    }
  };

  const handleToggleNotifyOnLeadRotation = async (checked: boolean) => {
    if (!user) return;
    setSavingPushSettings(true);
    
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ notify_on_lead_rotation: checked })
        .eq("id", user.id);
      
      if (error) throw error;
      
      setNotifyOnLeadRotation(checked);
      toast({
        title: checked ? "🔄 Alerta de rotação ativado!" : "Alerta de rotação desativado",
      });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erro", description: error.message });
    } finally {
      setSavingPushSettings(false);
    }
  };

  const handleSaveLeadRotationLimit = async () => {
    if (!user || leadRotationLimit < 1) return;
    setSavingLeadLimit(true);
    
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ lead_rotation_limit: leadRotationLimit })
        .eq("id", user.id);
      
      if (error) throw error;
      
      setOriginalLeadRotationLimit(leadRotationLimit);
      toast({ title: "Limite atualizado!", description: `Limite definido para ${leadRotationLimit}` });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erro", description: error.message });
    } finally {
      setSavingLeadLimit(false);
    }
  };

  const handleManualCheckLeadRotation = async () => {
    if (!user) return;
    setCheckingLeadRotation(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('check-lead-rotation-manual', {
        body: { user_id: user.id }
      });
      
      if (error) throw error;
      
      toast({
        title: data.notified > 0 ? "🔔 Notificações enviadas!" : "✅ Verificação concluída",
        description: data.message,
      });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erro na verificação", description: error.message });
    } finally {
      setCheckingLeadRotation(false);
    }
  };

  const handleAddSubscriptionId = async () => {
    if (!user || !newSubscriptionId.trim()) return;
    
    const trimmedId = newSubscriptionId.trim();
    if (pushSubscriptionIds.includes(trimmedId)) {
      toast({ variant: "destructive", title: "Token já existe" });
      return;
    }
    
    setSavingPushSettings(true);
    
    try {
      const newIds = [...pushSubscriptionIds, trimmedId];
      const { error } = await supabase
        .from("profiles")
        .update({ push_subscription_ids: newIds })
        .eq("id", user.id);
      
      if (error) throw error;
      
      setPushSubscriptionIds(newIds);
      setNewSubscriptionId("");
      toast({ title: "Token adicionado!" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erro", description: error.message });
    } finally {
      setSavingPushSettings(false);
    }
  };

  const handleRemoveSubscriptionId = async (tokenToRemove: string) => {
    if (!user) return;
    setSavingPushSettings(true);
    
    try {
      const newIds = pushSubscriptionIds.filter(id => id !== tokenToRemove);
      const { error } = await supabase
        .from("profiles")
        .update({ push_subscription_ids: newIds })
        .eq("id", user.id);
      
      if (error) throw error;
      
      setPushSubscriptionIds(newIds);
      toast({ title: "Token removido" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erro", description: error.message });
    } finally {
      setSavingPushSettings(false);
    }
  };

  const handleTestPush = async () => {
    setTestingPush(true);
    
    try {
      const result = await testPushNotification();
      
      if (result.success) {
        toast({
          title: "🔔 Teste enviado!",
          description: result.message || `Notificação enviada para ${result.devices_notified} dispositivo(s)`,
        });
      } else {
        toast({
          variant: "destructive",
          title: "Falha no teste",
          description: result.reason || "Não foi possível enviar a notificação",
        });
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erro no teste", description: error.message });
    } finally {
      setTestingPush(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-accent" />
            <CardTitle>Notificações Push</CardTitle>
          </div>
          <ColoredSwitch
            checked={pushWebhookEnabled}
            onCheckedChange={handleTogglePushEnabled}
            disabled={savingPushSettings}
          />
        </div>
        <CardDescription>
          Receba notificações em tempo real no seu dispositivo
        </CardDescription>
      </CardHeader>

      {pushWebhookEnabled && (
        <CardContent className="space-y-6">
          {/* Add Token */}
          <div className="space-y-2">
            <Label htmlFor="subscription-id" className="text-sm">
              Adicionar Token do Dispositivo
            </Label>
            <div className="flex gap-2">
              <Input
                id="subscription-id"
                placeholder="Insira o Token"
                value={newSubscriptionId}
                onChange={(e) => setNewSubscriptionId(e.target.value)}
                disabled={savingPushSettings}
                className="flex-1"
              />
              <Button
                onClick={handleAddSubscriptionId}
                disabled={savingPushSettings || !newSubscriptionId.trim()}
                size="icon"
                variant="outline"
                className="border-accent text-accent hover:bg-accent/10"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <a 
              href="https://zapdatanotifica.joaolucassps.co/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-accent hover:underline inline-flex items-center gap-1 text-xs"
            >
              Gere o token aqui: <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {/* Device List */}
          {pushSubscriptionIds.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm">
                Dispositivos cadastrados ({pushSubscriptionIds.length})
              </Label>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {pushSubscriptionIds.map((token, index) => (
                  <div 
                    key={index} 
                    className="flex items-center justify-between p-2 bg-secondary/30 rounded-md text-sm"
                  >
                    <span className="font-mono text-xs truncate max-w-[200px]" title={token}>
                      {token.slice(0, 20)}...{token.slice(-8)}
                    </span>
                    <Button
                      onClick={() => handleRemoveSubscriptionId(token)}
                      disabled={savingPushSettings}
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notification Options */}
          <div className="space-y-3 pt-4 border-t border-border">
            <Label className="text-sm font-medium">Tipos de notificação</Label>
            
            <div className="flex items-start space-x-3">
              <Checkbox
                id="notify-on-sale"
                checked={notifyOnSale}
                onCheckedChange={(checked) => handleToggleNotifyOnSale(checked as boolean)}
                disabled={savingPushSettings}
                className="mt-0.5"
              />
              <div className="space-y-1 flex-1">
                <Label htmlFor="notify-on-sale" className="text-sm font-medium cursor-pointer">
                  🔥 Notificar novas vendas
                </Label>
                <p className="text-xs text-muted-foreground">
                  Receba uma notificação quando o Tag Whats Cloud detectar uma nova venda
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <Checkbox
                id="notify-on-disconnect"
                checked={notifyOnDisconnect}
                onCheckedChange={(checked) => handleToggleNotifyOnDisconnect(checked as boolean)}
                disabled={savingPushSettings}
                className="mt-0.5"
              />
              <div className="space-y-1 flex-1">
                <Label htmlFor="notify-on-disconnect" className="text-sm font-medium cursor-pointer">
                  🚨 Alertar instância desconectada
                </Label>
                <p className="text-xs text-muted-foreground">
                  Receba um alerta quando uma instância do WhatsApp desconectar
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <Checkbox
                id="notify-on-lead-rotation"
                checked={notifyOnLeadRotation}
                onCheckedChange={(checked) => handleToggleNotifyOnLeadRotation(checked as boolean)}
                disabled={savingPushSettings}
                className="mt-0.5"
              />
              <div className="space-y-1 flex-1">
                <Label htmlFor="notify-on-lead-rotation" className="text-sm font-medium cursor-pointer">
                  🔄 Alerta de rotação de leads
                </Label>
                <p className="text-xs text-muted-foreground">
                  Receba um alerta quando uma instância atingir o limite diário de leads
                </p>
              </div>
            </div>

            {notifyOnLeadRotation && (
              <div className="ml-6 space-y-2 pl-4 border-l-2 border-accent/30">
                <Label htmlFor="lead-rotation-limit" className="text-sm text-muted-foreground">
                  Limite máximo de leads por instância
                </Label>
                <div className="flex items-center gap-1">
                  <Input
                    id="lead-rotation-limit"
                    type="number"
                    min={1}
                    value={leadRotationLimit}
                    onChange={(e) => setLeadRotationLimit(parseInt(e.target.value) || 30)}
                    disabled={savingLeadLimit}
                    className="w-20"
                  />
                  {leadRotationLimit !== originalLeadRotationLimit && (
                    <Button
                      onClick={handleSaveLeadRotationLimit}
                      disabled={savingLeadLimit}
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-green-500 hover:text-green-400 hover:bg-green-500/10"
                    >
                      {savingLeadLimit ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    </Button>
                  )}
                  <Button
                    onClick={handleManualCheckLeadRotation}
                    disabled={checkingLeadRotation || pushSubscriptionIds.length === 0}
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground hover:text-accent hover:bg-accent/10"
                    title="Verificar agora"
                  >
                    {checkingLeadRotation ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Test Button */}
          <Button
            onClick={handleTestPush}
            disabled={testingPush || pushSubscriptionIds.length === 0}
            variant="outline"
            className="w-full border-accent text-accent hover:bg-accent/10"
          >
            {testingPush ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Enviando teste...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Testar Notificação
              </>
            )}
          </Button>
        </CardContent>
      )}
    </Card>
  );
}
