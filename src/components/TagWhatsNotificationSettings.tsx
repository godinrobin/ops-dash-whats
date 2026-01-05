import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Bell, Smartphone, Monitor, Apple, Loader2, CheckCircle2, AlertCircle, Volume2, PartyPopper } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface NotificationPreference {
  id?: string;
  user_id: string;
  onesignal_player_id: string | null;
  device_type: string | null;
  is_enabled: boolean;
  nova_venda: boolean;
  pix_recebido: boolean;
  pingou: boolean;
  pix_x1: boolean;
  venda_confirmada: boolean;
  dinheiro_conta: boolean;
  venda_x1: boolean;
  pix_bolso: boolean;
  pix_confirmado: boolean;
  venda_paga: boolean;
  venda_aprovada: boolean;
  fun_notifications_enabled: boolean;
  custom_sound_url: string | null;
}

const NOTIFICATION_TYPES = [
  { key: "nova_venda", label: "🔥 Nova venda" },
  { key: "pix_recebido", label: "💸 Pix recebido" },
  { key: "pingou", label: "🤑 Pingou" },
  { key: "pix_x1", label: "💵 Pix do x1" },
  { key: "venda_confirmada", label: "🔔 Venda confirmada" },
  { key: "dinheiro_conta", label: "💰 Dinheiro na conta" },
  { key: "venda_x1", label: "🚀 Venda no x1" },
  { key: "pix_bolso", label: "💸 Pix no bolso" },
  { key: "pix_confirmado", label: "💵 Pix confirmado" },
  { key: "venda_paga", label: "⚡ Venda paga" },
  { key: "venda_aprovada", label: "📲 Venda aprovada" },
];

interface TagWhatsNotificationSettingsProps {
  userId: string;
  oneSignalAppId: string;
}

export function TagWhatsNotificationSettings({ userId, oneSignalAppId }: TagWhatsNotificationSettingsProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preference, setPreference] = useState<NotificationPreference | null>(null);
  const [deviceType, setDeviceType] = useState<string>("desktop");
  const [showTutorial, setShowTutorial] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [typesOpen, setTypesOpen] = useState(false);

  useEffect(() => {
    detectDeviceType();
    loadPreferences();
    checkSubscription();
  }, [userId]);

  const detectDeviceType = () => {
    const userAgent = navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(userAgent)) {
      setDeviceType("ios");
    } else if (/android/.test(userAgent)) {
      setDeviceType("android");
    } else {
      setDeviceType("desktop");
    }
  };

  const checkSubscription = async () => {
    try {
      // Check if OneSignal is available and user is subscribed
      const OneSignal = (window as any).OneSignal;
      if (OneSignal) {
        const subscription = await OneSignal.User?.PushSubscription?.optedIn;
        setIsSubscribed(!!subscription);
      }
    } catch (e) {
      console.log("OneSignal not available");
    }
  };

  const loadPreferences = async () => {
    try {
      const { data, error } = await (supabase
        .from("tag_whats_notification_preferences" as any)
        .select("*")
        .eq("user_id", userId)
        .maybeSingle() as any);

      if (error && error.code !== "PGRST116") throw error;
      
      if (data) {
        setPreference(data);
        setIsSubscribed(!!data.onesignal_player_id && data.is_enabled);
      }
    } catch (error) {
      console.error("Error loading preferences:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleEnableNotifications = async () => {
    setShowTutorial(true);
  };

  const handleSubscribe = async () => {
    setSaving(true);
    try {
      // Check if OneSignal is available
      const OneSignalDeferred = (window as any).OneSignalDeferred;
      
      if (!OneSignalDeferred) {
        toast.error("OneSignal não está disponível. Recarregue a página.");
        setSaving(false);
        return;
      }

      // Use a promise with timeout to avoid infinite loading
      const subscribeWithTimeout = new Promise<string | null>((resolve) => {
        const timeout = setTimeout(() => {
          console.log("[OneSignal] Timeout waiting for subscription");
          resolve(null);
        }, 15000); // 15 second timeout

        OneSignalDeferred.push(async (OneSignal: any) => {
          try {
            console.log("[OneSignal] Requesting permission...");
            
            // Check if already subscribed
            const isSubscribed = await OneSignal.Notifications?.permission;
            console.log("[OneSignal] Current permission:", isSubscribed);
            
            if (!isSubscribed) {
              // Request permission
              await OneSignal.Notifications?.requestPermission();
            }
            
            // Wait a bit for subscription to complete
            await new Promise(r => setTimeout(r, 2000));
            
            // Get the subscription ID
            const subscription = OneSignal.User?.PushSubscription;
            const playerId = subscription?.id;
            
            console.log("[OneSignal] Player ID:", playerId);
            
            clearTimeout(timeout);
            resolve(playerId || null);
          } catch (error) {
            console.error("[OneSignal] Error:", error);
            clearTimeout(timeout);
            resolve(null);
          }
        });
      });

      const playerId = await subscribeWithTimeout;
      
      if (!playerId) {
        toast.error("Não foi possível ativar notificações. Verifique se as permissões estão habilitadas nas configurações do navegador.");
        setSaving(false);
        return;
      }

      // Save to database
      const newPreference: Partial<NotificationPreference> = {
        user_id: userId,
        onesignal_player_id: playerId,
        device_type: deviceType,
        is_enabled: true,
        nova_venda: true,
        pix_recebido: true,
        pingou: true,
        pix_x1: true,
        venda_confirmada: true,
        dinheiro_conta: true,
        venda_x1: true,
        pix_bolso: true,
        pix_confirmado: true,
        venda_paga: true,
        venda_aprovada: true,
        fun_notifications_enabled: true,
      };

      const { data, error } = await (supabase
        .from("tag_whats_notification_preferences" as any)
        .upsert(newPreference, { onConflict: "user_id,device_type" })
        .select()
        .single() as any);

      if (error) throw error;

      setPreference(data);
      setIsSubscribed(true);
      setShowTutorial(false);
      toast.success("Notificações ativadas com sucesso!");
    } catch (error) {
      console.error("Error subscribing:", error);
      toast.error("Erro ao ativar notificações");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleNotification = async (key: string, value: boolean) => {
    if (!preference) return;
    
    const updated = { ...preference, [key]: value };
    setPreference(updated);
    
    try {
      const { error } = await (supabase
        .from("tag_whats_notification_preferences" as any)
        .update({ [key]: value })
        .eq("id", preference.id) as any);

      if (error) throw error;
    } catch (error) {
      console.error("Error updating preference:", error);
      toast.error("Erro ao salvar preferência");
    }
  };

  const handleToggleFunNotifications = async (value: boolean) => {
    if (!preference) return;
    
    const updated = { ...preference, fun_notifications_enabled: value };
    setPreference(updated);
    
    try {
      const { error } = await (supabase
        .from("tag_whats_notification_preferences" as any)
        .update({ fun_notifications_enabled: value })
        .eq("id", preference.id) as any);

      if (error) throw error;
      toast.success(value ? "Notificações divertidas ativadas!" : "Notificações divertidas desativadas");
    } catch (error) {
      console.error("Error updating fun notifications:", error);
      toast.error("Erro ao salvar preferência");
    }
  };

  const handleSoundUrlChange = async (url: string) => {
    if (!preference) return;
    
    const updated = { ...preference, custom_sound_url: url || null };
    setPreference(updated);
    
    try {
      const { error } = await (supabase
        .from("tag_whats_notification_preferences" as any)
        .update({ custom_sound_url: url || null })
        .eq("id", preference.id) as any);

      if (error) throw error;
    } catch (error) {
      console.error("Error updating sound URL:", error);
    }
  };

  const handleDisableNotifications = async () => {
    if (!preference) return;
    
    setSaving(true);
    try {
      const { error } = await (supabase
        .from("tag_whats_notification_preferences" as any)
        .update({ is_enabled: false })
        .eq("id", preference.id) as any);

      if (error) throw error;
      
      setPreference({ ...preference, is_enabled: false });
      setIsSubscribed(false);
      toast.success("Notificações desativadas");
    } catch (error) {
      console.error("Error disabling notifications:", error);
      toast.error("Erro ao desativar notificações");
    } finally {
      setSaving(false);
    }
  };

  const getDeviceIcon = () => {
    switch (deviceType) {
      case "ios": return <Apple className="h-5 w-5" />;
      case "android": return <Smartphone className="h-5 w-5" />;
      default: return <Monitor className="h-5 w-5" />;
    }
  };

  const getDeviceName = () => {
    switch (deviceType) {
      case "ios": return "iPhone/iPad";
      case "android": return "Android";
      default: return "Desktop";
    }
  };

  const renderTutorial = () => {
    if (deviceType === "ios") {
      return (
        <div className="space-y-4">
          <h4 className="font-semibold text-amber-400">Tutorial para iPhone/iPad</h4>
          <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
            <li>Adicione este site à tela inicial (compartilhar → adicionar à tela de início)</li>
            <li>Abra o app pela tela inicial</li>
            <li>Clique no botão abaixo para ativar notificações</li>
            <li>Permita as notificações quando solicitado</li>
          </ol>
          <div className="p-3 bg-amber-500/10 rounded-lg border border-amber-500/20">
            <p className="text-xs text-amber-400">
              <strong>Importante:</strong> No iOS, as notificações só funcionam se você abrir o app pela tela inicial, não pelo navegador Safari.
            </p>
          </div>
        </div>
      );
    }

    if (deviceType === "android") {
      return (
        <div className="space-y-4">
          <h4 className="font-semibold text-emerald-400">Tutorial para Android</h4>
          <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
            <li>Clique no botão abaixo para ativar notificações</li>
            <li>Permita as notificações quando o navegador solicitar</li>
            <li>Pronto! Você receberá notificações de novas vendas</li>
          </ol>
          <div className="p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
            <p className="text-xs text-emerald-400">
              <strong>Dica:</strong> Para melhor experiência, adicione o site à tela inicial (menu → adicionar à tela inicial)
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <h4 className="font-semibold text-blue-400">Tutorial para Desktop</h4>
        <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
          <li>Clique no botão abaixo para ativar notificações</li>
          <li>Permita as notificações quando o navegador solicitar</li>
          <li>Certifique-se de que as notificações do navegador estão ativadas nas configurações do sistema</li>
        </ol>
        <div className="p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
          <p className="text-xs text-blue-400">
            <strong>Dica:</strong> As notificações funcionam mesmo com o navegador minimizado, mas não quando completamente fechado.
          </p>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-amber-500/30 bg-amber-500/5">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500/20 rounded-full">
            <Bell className="h-5 w-5 text-amber-500" />
          </div>
          <div>
            <CardTitle className="text-lg">Receber Notificações</CardTitle>
            <CardDescription>
              Seja notificado a cada nova venda marcada pelo Tag Whats Cloud
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Device Detection */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {getDeviceIcon()}
          <span>Dispositivo detectado: <strong>{getDeviceName()}</strong></span>
        </div>

        {!isSubscribed && !showTutorial && (
          <Button 
            onClick={handleEnableNotifications}
            className="w-full bg-amber-600 hover:bg-amber-700"
          >
            <Bell className="h-4 w-4 mr-2" />
            Ativar Notificações
          </Button>
        )}

        {showTutorial && !isSubscribed && (
          <div className="space-y-4 p-4 bg-background/50 rounded-lg border">
            {renderTutorial()}
            <Button 
              onClick={handleSubscribe}
              disabled={saving}
              className="w-full bg-emerald-600 hover:bg-emerald-700"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Ativando...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Ativar Notificações
                </>
              )}
            </Button>
          </div>
        )}

        {isSubscribed && preference && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Notificações ativas
              </Badge>
            </div>

            {/* Notification Types */}
            <Collapsible open={typesOpen} onOpenChange={setTypesOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="outline" className="w-full justify-between">
                  <span>Tipos de notificação</span>
                  <span className="text-xs text-muted-foreground">
                    {NOTIFICATION_TYPES.filter(t => preference[t.key as keyof NotificationPreference]).length} selecionados
                  </span>
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3">
                <div className="grid grid-cols-2 gap-2">
                  {NOTIFICATION_TYPES.map((type) => (
                    <div key={type.key} className="flex items-center space-x-2">
                      <Checkbox
                        id={type.key}
                        checked={!!preference[type.key as keyof NotificationPreference]}
                        onCheckedChange={(checked) => handleToggleNotification(type.key, !!checked)}
                      />
                      <Label htmlFor={type.key} className="text-sm cursor-pointer">
                        {type.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Fun Notifications */}
            <div className="flex items-center justify-between p-3 bg-purple-500/10 rounded-lg border border-purple-500/20">
              <div className="flex items-center gap-2">
                <PartyPopper className="h-4 w-4 text-purple-400" />
                <div>
                  <p className="text-sm font-medium">Notificações divertidas</p>
                  <p className="text-xs text-muted-foreground">
                    Receba mensagens especiais a cada 10, 20, 50 e 100 vendas no dia
                  </p>
                </div>
              </div>
              <Switch
                checked={preference.fun_notifications_enabled}
                onCheckedChange={handleToggleFunNotifications}
              />
            </div>

            {/* Custom Sound */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Volume2 className="h-4 w-4" />
                Som personalizado (URL)
              </Label>
              <Input
                placeholder="https://exemplo.com/som.mp3"
                value={preference.custom_sound_url || ""}
                onChange={(e) => handleSoundUrlChange(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Cole a URL de um arquivo de áudio para usar como som de notificação
              </p>
            </div>

            {/* Disable Button */}
            <Button 
              variant="outline" 
              onClick={handleDisableNotifications}
              disabled={saving}
              className="w-full border-red-500/30 text-red-500 hover:bg-red-500/10"
            >
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <AlertCircle className="h-4 w-4 mr-2" />}
              Desativar Notificações
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
