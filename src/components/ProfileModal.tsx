import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/useSplashedToast";
import { useTheme } from "@/hooks/useTheme";
import { Moon, Sun, Camera, Loader2, Bell, Trash2, Plus, ExternalLink, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { testPushNotification } from "@/utils/pushNotifications";

interface ProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ProfileModal = ({ open, onOpenChange }: ProfileModalProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Username state
  const [username, setUsername] = useState("");
  const [originalUsername, setOriginalUsername] = useState("");
  const [savingUsername, setSavingUsername] = useState(false);
  
  // Push notification state
  const [pushWebhookEnabled, setPushWebhookEnabled] = useState(false);
  const [pushSubscriptionIds, setPushSubscriptionIds] = useState<string[]>([]);
  const [newSubscriptionId, setNewSubscriptionId] = useState("");
  const [savingPushSettings, setSavingPushSettings] = useState(false);
  const [testingPush, setTestingPush] = useState(false);
  const [notifyOnSale, setNotifyOnSale] = useState(false);

  // Fetch current profile on mount
  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return;
      
      const { data } = await supabase
        .from("profiles")
        .select("avatar_url, username, push_webhook_enabled, push_subscription_ids, notify_on_sale")
        .eq("id", user.id)
        .single();
      
      if (data?.avatar_url) {
        setAvatarUrl(data.avatar_url);
      }
      if (data?.username) {
        setUsername(data.username);
        setOriginalUsername(data.username);
      }
      // Push settings
      setPushWebhookEnabled(data?.push_webhook_enabled || false);
      setPushSubscriptionIds(data?.push_subscription_ids || []);
      setNotifyOnSale(data?.notify_on_sale || false);
    };

    if (open && user) {
      fetchProfile();
    }
  }, [open, user]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast({
        variant: "destructive",
        title: "Arquivo inválido",
        description: "Por favor, selecione uma imagem",
      });
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast({
        variant: "destructive",
        title: "Arquivo muito grande",
        description: "A imagem deve ter no máximo 2MB",
      });
      return;
    }

    setUploadingAvatar(true);

    try {
      // Upload to storage
      const fileExt = file.name.split(".").pop();
      const fileName = `${user.id}/avatar.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from("avatars")
        .getPublicUrl(fileName);

      // Add cache buster to force refresh
      const urlWithCacheBuster = `${publicUrl}?t=${Date.now()}`;

      // Update profile with avatar URL
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: urlWithCacheBuster })
        .eq("id", user.id);

      if (updateError) throw updateError;

      setAvatarUrl(urlWithCacheBuster);
      toast({
        title: "Foto atualizada!",
        description: "Sua foto de perfil foi salva com sucesso",
      });
    } catch (error: any) {
      console.error("Error uploading avatar:", error);
      toast({
        variant: "destructive",
        title: "Erro ao enviar foto",
        description: error.message,
      });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSaveUsername = async () => {
    if (!user || !username.trim()) {
      toast({
        variant: "destructive",
        title: "Nome inválido",
        description: "Por favor, digite um nome de usuário",
      });
      return;
    }

    const trimmedUsername = username.trim();

    // Don't save if unchanged
    if (trimmedUsername === originalUsername) {
      return;
    }

    setSavingUsername(true);

    try {
      // Check if username already exists (case-insensitive)
      const { data: existing } = await supabase
        .from("profiles")
        .select("id")
        .ilike("username", trimmedUsername)
        .neq("id", user.id)
        .maybeSingle();

      if (existing) {
        toast({
          variant: "destructive",
          title: "Nome já existe",
          description: "Este nome de usuário já está em uso. Escolha outro.",
        });
        setSavingUsername(false);
        return;
      }

      // Update username
      const { error } = await supabase
        .from("profiles")
        .update({ username: trimmedUsername })
        .eq("id", user.id);

      if (error) throw error;

      setOriginalUsername(trimmedUsername);
      toast({
        title: "Nome atualizado!",
        description: "Seu nome de usuário foi salvo com sucesso",
      });
    } catch (error: any) {
      console.error("Error updating username:", error);
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: error.message || "Não foi possível salvar o nome de usuário",
      });
    } finally {
      setSavingUsername(false);
    }
  };

  // Push notification handlers
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
      console.error("Error toggling push:", error);
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
        description: checked 
          ? "Você receberá uma notificação toda vez que uma venda for identificada" 
          : "Você não receberá mais notificações de vendas",
      });
    } catch (error: any) {
      console.error("Error toggling notify on sale:", error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: error.message || "Não foi possível alterar as configurações",
      });
    } finally {
      setSavingPushSettings(false);
    }
  };

  const handleAddSubscriptionId = async () => {
    if (!user || !newSubscriptionId.trim()) return;
    
    const trimmedId = newSubscriptionId.trim();
    if (pushSubscriptionIds.includes(trimmedId)) {
      toast({
        variant: "destructive",
        title: "Token já existe",
        description: "Este token já está cadastrado",
      });
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
      toast({
        title: "Token adicionado!",
        description: "Dispositivo cadastrado com sucesso",
      });
    } catch (error: any) {
      console.error("Error adding subscription ID:", error);
      toast({
        variant: "destructive",
        title: "Erro ao adicionar",
        description: error.message || "Não foi possível adicionar o token",
      });
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
      toast({
        title: "Token removido",
        description: "Dispositivo removido com sucesso",
      });
    } catch (error: any) {
      console.error("Error removing subscription ID:", error);
      toast({
        variant: "destructive",
        title: "Erro ao remover",
        description: error.message || "Não foi possível remover o token",
      });
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
      console.error("Error testing push:", error);
      toast({
        variant: "destructive",
        title: "Erro no teste",
        description: error.message || "Falha ao testar notificação",
      });
    } finally {
      setTestingPush(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newPassword || !confirmPassword) {
      toast({
        variant: "destructive",
        title: "Campos obrigatórios",
        description: "Preencha todos os campos de senha",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        variant: "destructive",
        title: "Senhas não conferem",
        description: "A nova senha e a confirmação devem ser iguais",
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        variant: "destructive",
        title: "Senha muito curta",
        description: "A senha deve ter pelo menos 6 caracteres",
      });
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    setLoading(false);

    if (error) {
      toast({
        variant: "destructive",
        title: "Erro ao alterar senha",
        description: error.message,
      });
    } else {
      toast({
        title: "Senha alterada com sucesso!",
        description: "Sua nova senha já está ativa",
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      onOpenChange(false);
    }
  };

  const displayName = username || user?.email?.split("@")[0] || "Usuário";
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md border-accent/50">
          <DialogHeader>
            <DialogTitle>Meu Perfil</DialogTitle>
            <DialogDescription>
              Visualize suas informações e configurações
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Avatar Upload */}
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <Avatar className="w-24 h-24 border-2 border-accent/30">
                  <AvatarImage src={avatarUrl || undefined} alt={displayName} />
                  <AvatarFallback className="text-2xl bg-accent/20 text-accent">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="absolute bottom-0 right-0 p-2 bg-accent text-accent-foreground rounded-full hover:bg-accent/90 transition-colors disabled:opacity-50"
                >
                  {uploadingAvatar ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Camera className="w-4 h-4" />
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  className="hidden"
                />
              </div>
              <p className="text-sm text-muted-foreground">
                Clique no ícone para alterar sua foto
              </p>
            </div>

            {/* User Info */}
            <div className="space-y-4 p-4 rounded-lg bg-secondary/30 border border-border">
              <div>
                <Label className="text-muted-foreground text-sm">Email</Label>
                <p className="font-medium">{user?.email}</p>
              </div>
              
              {/* Username edit */}
              <div className="space-y-2">
                <Label htmlFor="username" className="text-muted-foreground text-sm">Nome de Usuário</Label>
                <div className="flex gap-2">
                  <Input
                    id="username"
                    type="text"
                    placeholder="Digite seu nome de usuário"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={savingUsername}
                    className="flex-1 focus-visible:ring-accent focus-visible:border-accent"
                  />
                  <Button
                    onClick={handleSaveUsername}
                    disabled={savingUsername || username.trim() === originalUsername}
                    size="sm"
                    className="bg-accent hover:bg-accent/90 text-accent-foreground"
                  >
                    {savingUsername ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}
                  </Button>
                </div>
              </div>
            </div>

            {/* Theme Toggle */}
            <div className="space-y-3">
              <h3 className="font-semibold text-sm">Tema</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => setTheme("dark")}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition-all",
                    theme === "dark"
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border bg-secondary/30 text-muted-foreground hover:border-accent/50"
                  )}
                >
                  <Moon className="h-5 w-5" />
                  <span className="text-sm font-medium">Dark</span>
                </button>
                <button
                  onClick={() => setTheme("light")}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition-all",
                    theme === "light"
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border bg-secondary/30 text-muted-foreground hover:border-accent/50"
                  )}
                >
                  <Sun className="h-5 w-5" />
                  <span className="text-sm font-medium">Light</span>
                </button>
              </div>
            </div>

            {/* Push Notifications Section */}
            <div className="space-y-4 p-4 rounded-lg bg-secondary/30 border border-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell className="h-5 w-5 text-accent" />
                  <h3 className="font-semibold text-sm">Notificações Push</h3>
                </div>
                <Switch
                  checked={pushWebhookEnabled}
                  onCheckedChange={handleTogglePushEnabled}
                  disabled={savingPushSettings}
                />
              </div>

              {pushWebhookEnabled && (
                <div className="space-y-4">
                  {/* Add Subscription ID */}
                  <div className="space-y-2">
                    <Label htmlFor="subscription-id" className="text-muted-foreground text-sm">
                      Adicionar Token do Dispositivo
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="subscription-id"
                        type="text"
                        placeholder="Cole o subscription_id do OneSignal aqui..."
                        value={newSubscriptionId}
                        onChange={(e) => setNewSubscriptionId(e.target.value)}
                        disabled={savingPushSettings}
                        className="flex-1 focus-visible:ring-accent focus-visible:border-accent text-sm"
                      />
                      <Button
                        onClick={handleAddSubscriptionId}
                        disabled={savingPushSettings || !newSubscriptionId.trim()}
                        size="sm"
                        variant="outline"
                        className="border-accent text-accent hover:bg-accent/10"
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Obtenha o token no webapp{" "}
                      <a 
                        href="https://notifica.zapdata.com.br" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-accent hover:underline inline-flex items-center gap-1"
                      >
                        notifica.zapdata.com.br
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </p>
                  </div>

                  {/* Registered Devices */}
                  {pushSubscriptionIds.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-muted-foreground text-sm">
                        Dispositivos cadastrados ({pushSubscriptionIds.length})
                      </Label>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {pushSubscriptionIds.map((token, index) => (
                          <div 
                            key={index} 
                            className="flex items-center justify-between p-2 bg-background/50 rounded-md text-sm"
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

                  {/* Notify on Sale Checkbox */}
                  <div className="flex items-center space-x-3 pt-2 border-t border-border/50">
                    <Checkbox
                      id="notify-on-sale"
                      checked={notifyOnSale}
                      onCheckedChange={handleToggleNotifyOnSale}
                      disabled={savingPushSettings}
                    />
                    <div className="space-y-0.5">
                      <Label 
                        htmlFor="notify-on-sale" 
                        className="text-sm font-medium cursor-pointer"
                      >
                        🔥 Notificar novas vendas
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Receba "Pix Pago no x1! 🔥" quando o Tag Whats Cloud detectar uma venda
                      </p>
                    </div>
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
                </div>
              )}
            </div>

            {/* Change Password Form */}
            <form id="password-section" onSubmit={handleChangePassword} className="space-y-4">
              <h3 className="font-semibold text-sm">Alterar Senha</h3>
              
              <div className="space-y-2">
                <Label htmlFor="new-password">Nova senha</Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder="Digite a nova senha"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={loading}
                  className="focus-visible:ring-accent focus-visible:border-accent"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirmar nova senha</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="Confirme a nova senha"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={loading}
                  className="focus-visible:ring-accent focus-visible:border-accent"
                />
              </div>

              <Button
                type="submit"
                className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"
                disabled={loading}
              >
                {loading ? "Alterando..." : "Alterar Senha"}
              </Button>
            </form>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};