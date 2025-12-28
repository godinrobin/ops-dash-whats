import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { 
  Bell, Copy, Check, Plus, Trash2, Loader2, ExternalLink, 
  Smartphone, Monitor, Download, ChevronDown, ChevronUp,
  DollarSign, AlertCircle
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface NotificationsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Webhook {
  id: string;
  webhook_id: string;
  bank_type: string;
  is_active: boolean;
  notifications_count: number;
  total_received: number;
  created_at: string;
}

interface Notification {
  id: string;
  amount: number;
  payer_name: string | null;
  bank_type: string;
  notification_sent: boolean;
  created_at: string;
}

export function NotificationsModal({ open, onOpenChange }: NotificationsModalProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [creating, setCreating] = useState(false);
  const [newBankType, setNewBankType] = useState<"inter" | "infinitepay">("inter");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedTutorial, setExpandedTutorial] = useState<string | null>(null);

  const WEBHOOK_BASE_URL = "https://dcjizoulbggsavizbukq.supabase.co/functions/v1/payment-webhook";

  useEffect(() => {
    if (open && user) {
      loadData();
    }
  }, [open, user]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Load webhooks
      const { data: webhooksData, error: webhooksError } = await supabase
        .from("user_payment_webhooks")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (webhooksError) throw webhooksError;
      setWebhooks(webhooksData || []);

      // Load recent notifications
      const { data: notificationsData, error: notificationsError } = await supabase
        .from("payment_notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (notificationsError) throw notificationsError;
      setNotifications(notificationsData || []);
    } catch (err) {
      console.error("Error loading data:", err);
      toast.error("Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  };

  const generateWebhookId = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 12; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const createWebhook = async () => {
    if (!user) return;
    setCreating(true);

    try {
      const webhookId = generateWebhookId();

      const { error } = await supabase
        .from("user_payment_webhooks")
        .insert({
          user_id: user.id,
          webhook_id: webhookId,
          bank_type: newBankType,
          is_active: true
        });

      if (error) throw error;

      toast.success("Webhook criado com sucesso!");
      loadData();
    } catch (err) {
      console.error("Error creating webhook:", err);
      toast.error("Erro ao criar webhook");
    } finally {
      setCreating(false);
    }
  };

  const toggleWebhook = async (webhookId: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from("user_payment_webhooks")
        .update({ is_active: isActive })
        .eq("id", webhookId);

      if (error) throw error;

      setWebhooks(prev => prev.map(w => 
        w.id === webhookId ? { ...w, is_active: isActive } : w
      ));

      toast.success(isActive ? "Webhook ativado" : "Webhook desativado");
    } catch (err) {
      console.error("Error toggling webhook:", err);
      toast.error("Erro ao atualizar webhook");
    }
  };

  const deleteWebhook = async (webhookId: string) => {
    try {
      const { error } = await supabase
        .from("user_payment_webhooks")
        .delete()
        .eq("id", webhookId);

      if (error) throw error;

      setWebhooks(prev => prev.filter(w => w.id !== webhookId));
      toast.success("Webhook excluído");
    } catch (err) {
      console.error("Error deleting webhook:", err);
      toast.error("Erro ao excluir webhook");
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success("Copiado para a área de transferência!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getWebhookUrl = (webhookId: string) => `${WEBHOOK_BASE_URL}/${webhookId}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notificações de Pagamento
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="webhooks" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
            <TabsTrigger value="history">Histórico</TabsTrigger>
            <TabsTrigger value="tutorial">Tutorial</TabsTrigger>
          </TabsList>

          {/* Webhooks Tab */}
          <TabsContent value="webhooks" className="space-y-4">
            {/* Create new webhook */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Criar Webhook</CardTitle>
                <CardDescription>
                  Adicione um webhook para receber notificações do seu banco
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-4 items-end">
                  <div className="flex-1">
                    <Label>Banco</Label>
                    <Select value={newBankType} onValueChange={(v) => setNewBankType(v as any)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="inter">Banco Inter</SelectItem>
                        <SelectItem value="infinitepay">InfinitePay</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={createWebhook} disabled={creating}>
                    {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                    Criar Webhook
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Webhooks list */}
            <ScrollArea className="h-[400px]">
              {loading ? (
                <div className="flex items-center justify-center h-40">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : webhooks.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhum webhook configurado</p>
                  <p className="text-sm">Crie um webhook para receber notificações de PIX</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {webhooks.map((webhook) => (
                    <Card key={webhook.id} className={!webhook.is_active ? "opacity-60" : ""}>
                      <CardContent className="pt-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-2">
                              <Badge variant={webhook.bank_type === "inter" ? "default" : "secondary"}>
                                {webhook.bank_type === "inter" ? "Banco Inter" : "InfinitePay"}
                              </Badge>
                              {webhook.is_active ? (
                                <Badge variant="outline" className="text-green-500 border-green-500">Ativo</Badge>
                              ) : (
                                <Badge variant="outline" className="text-red-500 border-red-500">Inativo</Badge>
                              )}
                            </div>
                            
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">URL do Webhook</Label>
                              <div className="flex items-center gap-2">
                                <Input 
                                  value={getWebhookUrl(webhook.webhook_id)} 
                                  readOnly 
                                  className="font-mono text-xs"
                                />
                                <Button
                                  variant="outline"
                                  size="icon"
                                  onClick={() => copyToClipboard(getWebhookUrl(webhook.webhook_id), webhook.id)}
                                >
                                  {copiedId === webhook.id ? (
                                    <Check className="h-4 w-4 text-green-500" />
                                  ) : (
                                    <Copy className="h-4 w-4" />
                                  )}
                                </Button>
                              </div>
                            </div>

                            <div className="flex gap-4 text-sm text-muted-foreground">
                              <span>{webhook.notifications_count} notificações</span>
                              <span>R$ {Number(webhook.total_received).toFixed(2)} recebido</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <Switch
                              checked={webhook.is_active}
                              onCheckedChange={(checked) => toggleWebhook(webhook.id, checked)}
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-red-500 hover:text-red-600"
                              onClick={() => deleteWebhook(webhook.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history">
            <ScrollArea className="h-[500px]">
              {notifications.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhuma notificação recebida</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {notifications.map((notif) => (
                    <Card key={notif.id}>
                      <CardContent className="py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-full bg-green-500/10">
                            <DollarSign className="h-5 w-5 text-green-500" />
                          </div>
                          <div>
                            <p className="font-semibold text-green-500">
                              R$ {Number(notif.amount).toFixed(2)}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {notif.payer_name || "Pagador desconhecido"}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <Badge variant="outline">
                            {notif.bank_type === "inter" ? "Inter" : "InfinitePay"}
                          </Badge>
                          <p className="text-xs text-muted-foreground mt-1">
                            {format(new Date(notif.created_at), "dd/MM HH:mm", { locale: ptBR })}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          {/* Tutorial Tab */}
          <TabsContent value="tutorial">
            <ScrollArea className="h-[500px]">
              <div className="space-y-4">
                {/* Install PWA Tutorial */}
                <Card>
                  <CardHeader 
                    className="cursor-pointer"
                    onClick={() => setExpandedTutorial(expandedTutorial === "pwa" ? null : "pwa")}
                  >
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Download className="h-5 w-5" />
                        Instalar o App (Receber Notificações)
                      </CardTitle>
                      {expandedTutorial === "pwa" ? <ChevronUp /> : <ChevronDown />}
                    </div>
                  </CardHeader>
                  {expandedTutorial === "pwa" && (
                    <CardContent className="space-y-4">
                      <div className="space-y-3">
                        <div className="flex items-start gap-3">
                          <Monitor className="h-5 w-5 mt-0.5 text-primary" />
                          <div>
                            <p className="font-semibold">No PC (Chrome/Edge)</p>
                            <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1">
                              <li>Acesse zapdata.co</li>
                              <li>Clique no ícone de instalar (⊕) na barra de endereço</li>
                              <li>Confirme "Instalar"</li>
                              <li>Permita notificações quando solicitado</li>
                            </ol>
                          </div>
                        </div>

                        <div className="flex items-start gap-3">
                          <Smartphone className="h-5 w-5 mt-0.5 text-primary" />
                          <div>
                            <p className="font-semibold">No Android (Chrome)</p>
                            <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1">
                              <li>Acesse zapdata.co</li>
                              <li>Toque no menu (⋮) no canto superior</li>
                              <li>Selecione "Adicionar à tela inicial"</li>
                              <li>Confirme e permita notificações</li>
                            </ol>
                          </div>
                        </div>

                        <div className="flex items-start gap-3">
                          <Smartphone className="h-5 w-5 mt-0.5 text-primary" />
                          <div>
                            <p className="font-semibold">No iPhone/Mac (Safari)</p>
                            <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1">
                              <li>Acesse zapdata.co no Safari</li>
                              <li>Toque no ícone de compartilhar (↑)</li>
                              <li>Selecione "Adicionar à Tela de Início"</li>
                              <li>Abra o app e permita notificações</li>
                            </ol>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  )}
                </Card>

                {/* Inter Tutorial */}
                <Card>
                  <CardHeader 
                    className="cursor-pointer"
                    onClick={() => setExpandedTutorial(expandedTutorial === "inter" ? null : "inter")}
                  >
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">Configurar Banco Inter</CardTitle>
                      {expandedTutorial === "inter" ? <ChevronUp /> : <ChevronDown />}
                    </div>
                  </CardHeader>
                  {expandedTutorial === "inter" && (
                    <CardContent className="space-y-3">
                      <ol className="list-decimal list-inside space-y-2 text-sm">
                        <li>Acesse o Internet Banking do Banco Inter</li>
                        <li>Vá em <strong>Conta Digital &gt; Configurações &gt; Webhooks</strong></li>
                        <li>Clique em <strong>"Adicionar Webhook"</strong></li>
                        <li>Cole a URL do webhook criada aqui</li>
                        <li>Selecione o evento <strong>"Pix Recebido"</strong></li>
                        <li>Salve as configurações</li>
                      </ol>
                      <div className="p-3 bg-yellow-500/10 rounded-lg flex items-start gap-2">
                        <AlertCircle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-yellow-600">
                          Você precisa ter uma conta PJ ou Conta Digital MEI para acessar webhooks no Inter.
                        </p>
                      </div>
                    </CardContent>
                  )}
                </Card>

                {/* InfinitePay Tutorial */}
                <Card>
                  <CardHeader 
                    className="cursor-pointer"
                    onClick={() => setExpandedTutorial(expandedTutorial === "infinitepay" ? null : "infinitepay")}
                  >
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">Configurar InfinitePay</CardTitle>
                      {expandedTutorial === "infinitepay" ? <ChevronUp /> : <ChevronDown />}
                    </div>
                  </CardHeader>
                  {expandedTutorial === "infinitepay" && (
                    <CardContent className="space-y-3">
                      <ol className="list-decimal list-inside space-y-2 text-sm">
                        <li>Acesse o Dashboard da InfinitePay</li>
                        <li>Vá em <strong>Configurações &gt; Integrações &gt; Webhooks</strong></li>
                        <li>Clique em <strong>"Adicionar URL de Webhook"</strong></li>
                        <li>Cole a URL do webhook criada aqui</li>
                        <li>Marque os eventos de <strong>"Pagamento Confirmado"</strong></li>
                        <li>Salve as configurações</li>
                      </ol>
                      <Button variant="outline" className="w-full" asChild>
                        <a href="https://app.infinitepay.io" target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Acessar InfinitePay
                        </a>
                      </Button>
                    </CardContent>
                  )}
                </Card>
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
