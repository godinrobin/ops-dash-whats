import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bell, Send, Loader2, CheckCircle2, AlertCircle, Monitor, Smartphone, Apple, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface NotificationPref {
  id: string;
  user_id: string;
  device_type: string;
  is_enabled: boolean;
  onesignal_player_id: string;
}

export function AdminTagWhatsNotifications() {
  const [users, setUsers] = useState<{id: string; username: string; email: string}[]>([]);
  const [selectedUser, setSelectedUser] = useState<string>("");
  const [userPrefs, setUserPrefs] = useState<NotificationPref[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [customMessage, setCustomMessage] = useState("");

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    if (selectedUser) {
      loadUserPreferences(selectedUser);
    }
  }, [selectedUser]);

  const loadUsers = async () => {
    try {
      // Get users who have notification preferences
      const { data: prefs, error } = await (supabase
        .from("tag_whats_notification_preferences" as any)
        .select("user_id")
        .eq("is_enabled", true) as any);

      if (error) throw error;

      const userIds = [...new Set(prefs?.map((p: any) => p.user_id) || [])] as string[];

      if (userIds.length === 0) {
        setUsers([]);
        return;
      }

      // Get user profiles
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, username")
        .in("id", userIds);

      if (profilesError) throw profilesError;

      setUsers(profiles?.map(p => ({
        id: p.id,
        username: p.username || p.id.substring(0, 8),
        email: p.username || p.id.substring(0, 8),
      })) || []);
    } catch (error) {
      console.error("Error loading users:", error);
    }
  };

  const loadUserPreferences = async (userId: string) => {
    setLoading(true);
    try {
      const { data, error } = await (supabase
        .from("tag_whats_notification_preferences" as any)
        .select("*")
        .eq("user_id", userId)
        .eq("is_enabled", true) as any);

      if (error) throw error;
      setUserPrefs(data || []);
    } catch (error) {
      console.error("Error loading preferences:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSendTestNotification = async () => {
    if (!selectedUser) {
      toast.error("Selecione um usuário");
      return;
    }

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-tag-whats-notification", {
        body: {
          user_id: selectedUser,
          type: "test",
          custom_message: customMessage || "🔔 Teste de notificação - Tag Whats Cloud",
        },
      });

      if (error) throw error;

      if (data.success) {
        toast.success(`Notificação enviada para ${data.recipients || 0} dispositivo(s)`);
      } else {
        toast.error(data.error || "Erro ao enviar notificação");
      }
    } catch (error) {
      console.error("Error sending notification:", error);
      toast.error("Erro ao enviar notificação");
    } finally {
      setSending(false);
    }
  };

  const getDeviceIcon = (type: string) => {
    switch (type) {
      case "ios": return <Apple className="h-4 w-4" />;
      case "android": return <Smartphone className="h-4 w-4" />;
      default: return <Monitor className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Tutorial Section */}
      <Card className="border-blue-500/30 bg-blue-500/5">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Info className="h-5 w-5 text-blue-500" />
            <CardTitle className="text-lg">Tutorial: Ativar Notificações</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <div className="p-4 bg-background/50 rounded-lg border">
              <div className="flex items-center gap-2 mb-2">
                <Monitor className="h-5 w-5 text-blue-400" />
                <h4 className="font-semibold">Desktop</h4>
              </div>
              <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1">
                <li>Acesse a página Tag Whats Cloud</li>
                <li>Clique em "Ativar Notificações"</li>
                <li>Permita as notificações no navegador</li>
              </ol>
            </div>
            
            <div className="p-4 bg-background/50 rounded-lg border">
              <div className="flex items-center gap-2 mb-2">
                <Smartphone className="h-5 w-5 text-emerald-400" />
                <h4 className="font-semibold">Android</h4>
              </div>
              <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1">
                <li>Acesse pelo Chrome</li>
                <li>Clique em "Ativar Notificações"</li>
                <li>Permita as notificações</li>
                <li>(Opcional) Adicione à tela inicial</li>
              </ol>
            </div>
            
            <div className="p-4 bg-background/50 rounded-lg border">
              <div className="flex items-center gap-2 mb-2">
                <Apple className="h-5 w-5 text-gray-400" />
                <h4 className="font-semibold">iPhone/iPad</h4>
              </div>
              <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1">
                <li>Adicione o site à tela inicial</li>
                <li>Abra pelo ícone na tela inicial</li>
                <li>Clique em "Ativar Notificações"</li>
                <li>Permita nas configurações</li>
              </ol>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Test Notification Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-amber-500" />
            <CardTitle>Testar Notificação</CardTitle>
          </div>
          <CardDescription>
            Envie uma notificação de teste para verificar se está funcionando
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Selecione o usuário</Label>
            <Select value={selectedUser} onValueChange={setSelectedUser}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha um usuário..." />
              </SelectTrigger>
              <SelectContent>
                {users.length === 0 ? (
                  <SelectItem value="_none" disabled>
                    Nenhum usuário com notificações ativas
                  </SelectItem>
                ) : (
                  users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.username}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {selectedUser && (
            <>
              {loading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : userPrefs.length === 0 ? (
                <div className="p-4 bg-amber-500/10 rounded-lg border border-amber-500/20">
                  <p className="text-sm text-amber-400">
                    <AlertCircle className="h-4 w-4 inline mr-2" />
                    Este usuário não tem dispositivos com notificações ativas
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>Dispositivos ativos</Label>
                    <div className="flex flex-wrap gap-2">
                      {userPrefs.map((pref) => (
                        <div key={pref.id} className="flex items-center gap-1 px-3 py-1 bg-emerald-500/10 rounded-full border border-emerald-500/20">
                          {getDeviceIcon(pref.device_type)}
                          <span className="text-sm text-emerald-500">
                            {pref.device_type === "ios" ? "iPhone" : pref.device_type === "android" ? "Android" : "Desktop"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Mensagem personalizada (opcional)</Label>
                    <Input
                      placeholder="🔔 Teste de notificação - Tag Whats Cloud"
                      value={customMessage}
                      onChange={(e) => setCustomMessage(e.target.value)}
                    />
                  </div>

                  <Button 
                    onClick={handleSendTestNotification}
                    disabled={sending}
                    className="w-full bg-amber-600 hover:bg-amber-700"
                  >
                    {sending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        Enviar Notificação de Teste
                      </>
                    )}
                  </Button>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Stats */}
      <Card>
        <CardHeader>
          <CardTitle>Usuários com Notificações Ativas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <p className="text-4xl font-bold text-amber-500">{users.length}</p>
            <p className="text-sm text-muted-foreground">usuários</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
