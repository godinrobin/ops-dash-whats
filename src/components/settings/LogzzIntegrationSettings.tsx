import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminStatus } from "@/hooks/useAdminStatus";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ColoredSwitch } from "@/components/ui/colored-switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Copy, RefreshCw, ExternalLink, Package, Clock, CheckCircle2, Loader2, History, XCircle, Plus, Trash2, Workflow, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface LogzzWebhook {
  id: string;
  webhook_token: string;
  is_active: boolean;
  created_at: string;
  event_type: string;
  flow_id: string | null;
  name: string | null;
  flow?: {
    id: string;
    name: string;
  } | null;
}

interface Flow {
  id: string;
  name: string;
}

interface WebhookHistoryItem {
  id: string;
  order_number?: string | null;
  client_name: string | null;
  recipient_name?: string | null;
  order_status?: string | null;
  cart_status?: string | null;
  status?: string | null;
  tracking_code?: string | null;
  created_at: string;
}

const EVENT_TYPES = [
  { value: "pedido", label: "Pedido", endpoint: "webhook-logzz-order" },
  { value: "abandono_carrinho", label: "Abandono de Carrinho", endpoint: "webhook-logzz-cart" },
  { value: "expedicao_tradicional", label: "Expedição Tradicional", endpoint: "webhook-logzz-shipment" }
];

export function LogzzIntegrationSettings() {
  const { user } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdminStatus();
  const [webhooks, setWebhooks] = useState<LogzzWebhook[]>([]);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newIntegration, setNewIntegration] = useState({
    name: "",
    event_type: "pedido",
    flow_id: ""
  });
  const [expandedWebhook, setExpandedWebhook] = useState<string | null>(null);
  const [history, setHistory] = useState<Record<string, WebhookHistoryItem[]>>({});

  const WEBHOOK_BASE_URL = "https://dcjizoulbggsavizbukq.supabase.co/functions/v1";

  useEffect(() => {
    if (user && isAdmin) {
      fetchWebhooks();
      fetchFlows();
    } else {
      setLoading(false);
    }
  }, [user, isAdmin]);

  // Fetch recent webhook history for expanded webhook
  useEffect(() => {
    if (!user || !isAdmin || !expandedWebhook) return;

    const webhook = webhooks.find(w => w.id === expandedWebhook);
    if (!webhook) return;

    const fetchHistory = async () => {
      const thirtySecondsAgo = new Date(Date.now() - 30000).toISOString();
      
      // Choose the right table based on event type
      if (webhook.event_type === 'abandono_carrinho') {
        const { data, error } = await supabase
          .from('logzz_cart_abandonments')
          .select('id, client_name, cart_status, created_at')
          .eq('user_id', user.id)
          .eq('webhook_id', webhook.id)
          .gte('created_at', thirtySecondsAgo)
          .order('created_at', { ascending: false })
          .limit(10);

        if (!error && data) {
          setHistory(prev => ({ ...prev, [expandedWebhook]: data as unknown as WebhookHistoryItem[] }));
        }
      } else if (webhook.event_type === 'expedicao_tradicional') {
        const { data, error } = await supabase
          .from('logzz_shipments')
          .select('id, recipient_name, status, tracking_code, created_at')
          .eq('user_id', user.id)
          .eq('webhook_id', webhook.id)
          .gte('created_at', thirtySecondsAgo)
          .order('created_at', { ascending: false })
          .limit(10);

        if (!error && data) {
          setHistory(prev => ({ ...prev, [expandedWebhook]: data as unknown as WebhookHistoryItem[] }));
        }
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any)
          .from('logzz_orders')
          .select('id, order_number, client_name, order_status, created_at')
          .eq('user_id', user.id)
          .eq('webhook_id', webhook.id)
          .gte('created_at', thirtySecondsAgo)
          .order('created_at', { ascending: false })
          .limit(10);

        if (!error && data) {
          setHistory(prev => ({ ...prev, [expandedWebhook]: data as WebhookHistoryItem[] }));
        }
      }
    };

    fetchHistory();
    const interval = setInterval(fetchHistory, 3000);

    return () => clearInterval(interval);
  }, [user, isAdmin, expandedWebhook, webhooks]);

  const fetchWebhooks = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('logzz_webhooks')
        .select(`
          *,
          flow:inbox_flows(id, name)
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setWebhooks((data || []) as LogzzWebhook[]);
    } catch (error) {
      console.error('Error fetching webhooks:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchFlows = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('inbox_flows')
        .select('id, name')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setFlows((data || []) as Flow[]);
    } catch (error) {
      console.error('Error fetching flows:', error);
    }
  };

  const createWebhook = async () => {
    if (!user) return;
    if (!newIntegration.name.trim()) {
      toast.error('Digite um nome para a integração');
      return;
    }

    setCreating(true);
    try {
      const { data, error } = await supabase
        .from('logzz_webhooks')
        .insert({
          user_id: user.id,
          name: newIntegration.name,
          event_type: newIntegration.event_type,
          flow_id: newIntegration.flow_id || null
        })
        .select(`
          *,
          flow:inbox_flows(id, name)
        `)
        .single();

      if (error) throw error;
      setWebhooks(prev => [data as LogzzWebhook, ...prev]);
      setShowCreateModal(false);
      setNewIntegration({ name: "", event_type: "pedido", flow_id: "" });
      toast.success('Integração criada com sucesso!');
    } catch (error) {
      console.error('Error creating webhook:', error);
      toast.error('Erro ao criar integração');
    } finally {
      setCreating(false);
    }
  };

  const deleteWebhook = async (id: string) => {
    try {
      const { error } = await supabase
        .from('logzz_webhooks')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setWebhooks(prev => prev.filter(w => w.id !== id));
      toast.success('Integração removida!');
    } catch (error) {
      console.error('Error deleting webhook:', error);
      toast.error('Erro ao remover integração');
    }
  };

  const regenerateToken = async (webhook: LogzzWebhook) => {
    try {
      const newToken = crypto.randomUUID();
      const { data, error } = await supabase
        .from('logzz_webhooks')
        .update({ webhook_token: newToken })
        .eq('id', webhook.id)
        .select(`
          *,
          flow:inbox_flows(id, name)
        `)
        .single();

      if (error) throw error;
      setWebhooks(prev => prev.map(w => w.id === webhook.id ? data as LogzzWebhook : w));
      toast.success('Token regenerado!');
    } catch (error) {
      console.error('Error regenerating token:', error);
      toast.error('Erro ao regenerar token');
    }
  };

  const toggleWebhook = async (webhook: LogzzWebhook, active: boolean) => {
    try {
      const { error } = await supabase
        .from('logzz_webhooks')
        .update({ is_active: active })
        .eq('id', webhook.id);

      if (error) throw error;
      setWebhooks(prev => prev.map(w => w.id === webhook.id ? { ...w, is_active: active } : w));
      toast.success(active ? 'Integração ativada!' : 'Integração desativada!');
    } catch (error) {
      console.error('Error toggling webhook:', error);
      toast.error('Erro ao alterar status');
    }
  };

  const updateWebhookFlow = async (webhook: LogzzWebhook, flowId: string | null) => {
    try {
      const { data, error } = await supabase
        .from('logzz_webhooks')
        .update({ flow_id: flowId })
        .eq('id', webhook.id)
        .select(`
          *,
          flow:inbox_flows(id, name)
        `)
        .single();

      if (error) throw error;
      setWebhooks(prev => prev.map(w => w.id === webhook.id ? data as LogzzWebhook : w));
      toast.success('Fluxo atualizado!');
    } catch (error) {
      console.error('Error updating flow:', error);
      toast.error('Erro ao atualizar fluxo');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copiado!');
  };

  const getWebhookUrl = (webhook: LogzzWebhook) => {
    const eventConfig = EVENT_TYPES.find(e => e.value === webhook.event_type);
    const endpoint = eventConfig?.endpoint || 'webhook-logzz-order';
    return `${WEBHOOK_BASE_URL}/${endpoint}?token=${webhook.webhook_token}`;
  };

  if (adminLoading || loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <Card className="border-dashed">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-muted flex items-center justify-center">
            <Package className="h-8 w-8 text-muted-foreground" />
          </div>
          <CardTitle className="flex items-center justify-center gap-2">
            Integração Logzz
            <Badge variant="secondary" className="ml-2">
              <Clock className="h-3 w-3 mr-1" />
              Em Breve
            </Badge>
          </CardTitle>
          <CardDescription className="max-w-md mx-auto">
            A integração com a plataforma Logzz estará disponível em breve. 
            Você poderá receber webhooks de pedidos diretamente no ZapData.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <Button variant="outline" asChild>
            <a href="https://app.logzz.com.br/" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-2" />
              Conhecer Logzz
            </a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Package className="h-5 w-5" />
            Integrações Logzz
          </h2>
          <p className="text-sm text-muted-foreground">
            Receba webhooks de pedidos e acione fluxos automaticamente
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nova Integração
        </Button>
      </div>

      {/* Webhooks List */}
      {webhooks.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="font-medium mb-2">Nenhuma integração configurada</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Crie sua primeira integração para começar a receber eventos da Logzz
            </p>
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Criar Integração
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {webhooks.map((webhook) => (
            <Card key={webhook.id} className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-base flex items-center gap-2">
                      {webhook.name || 'Integração sem nome'}
                      <Badge variant={webhook.is_active ? "default" : "secondary"} className={webhook.is_active ? "bg-green-500" : "bg-red-500 text-white"}>
                        {webhook.is_active ? (
                          <>
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Ativo
                          </>
                        ) : (
                          <>
                            <XCircle className="h-3 w-3 mr-1" />
                            Inativo
                          </>
                        )}
                      </Badge>
                    </CardTitle>
                    <CardDescription className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-xs">
                        Evento: {EVENT_TYPES.find(e => e.value === webhook.event_type)?.label || webhook.event_type}
                      </Badge>
                      {webhook.flow && (
                        <Badge variant="secondary" className="text-xs">
                          <Workflow className="h-3 w-3 mr-1" />
                          {webhook.flow.name}
                        </Badge>
                      )}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <ColoredSwitch 
                      checked={webhook.is_active}
                      onCheckedChange={(checked) => toggleWebhook(webhook, checked)}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => deleteWebhook(webhook.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Webhook URL */}
                <div className="space-y-2">
                  <Label className="text-xs">URL do Webhook</Label>
                  <div className="flex gap-2">
                    <Input 
                      value={getWebhookUrl(webhook)} 
                      readOnly 
                      className="font-mono text-xs"
                    />
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={() => copyToClipboard(getWebhookUrl(webhook))}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={() => regenerateToken(webhook)}
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Flow Selector */}
                <div className="space-y-2">
                  <Label className="text-xs">Fluxo a ser acionado</Label>
                  <Select
                    value={webhook.flow_id || "none"}
                    onValueChange={(value) => updateWebhookFlow(webhook, value === "none" ? null : value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um fluxo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum fluxo</SelectItem>
                      {flows.map((flow) => (
                        <SelectItem key={flow.id} value={flow.id}>
                          {flow.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* History Toggle */}
                {webhook.is_active && (
                  <div className="pt-2 border-t">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-between"
                      onClick={() => setExpandedWebhook(expandedWebhook === webhook.id ? null : webhook.id)}
                    >
                      <span className="flex items-center gap-2">
                        <History className="h-4 w-4" />
                        Histórico (últimos 30s)
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {history[webhook.id]?.length || 0}
                      </Badge>
                    </Button>
                    
                    {expandedWebhook === webhook.id && (
                      <div className="mt-2 space-y-2">
                        {(history[webhook.id] || []).length === 0 ? (
                          <div className="text-center py-4 text-muted-foreground text-sm">
                            <History className="h-6 w-6 mx-auto mb-1 opacity-50" />
                            Nenhuma requisição recente
                          </div>
                        ) : (
                          (history[webhook.id] || []).map((item) => (
                            <div 
                              key={item.id} 
                              className="flex items-center justify-between p-2 rounded bg-muted/50 text-sm"
                            >
                              <div className="flex items-center gap-2">
                                <div className="h-2 w-2 rounded-full bg-positive animate-pulse" />
                                <div>
                                  <p className="font-medium">
                                    {webhook.event_type === 'abandono_carrinho' 
                                      ? (item.cart_status || 'Carrinho abandonado')
                                      : webhook.event_type === 'expedicao_tradicional'
                                        ? (item.tracking_code || item.status || 'Expedição')
                                        : (item.order_number || 'Sem número')}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {item.client_name || item.recipient_name}
                                  </p>
                                </div>
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {formatDistanceToNow(new Date(item.created_at), { addSuffix: true, locale: ptBR })}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Instructions Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Como configurar na Logzz</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <ol className="list-decimal list-inside space-y-2">
            <li>Acesse <a href="https://app.logzz.com.br/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">app.logzz.com.br</a></li>
            <li>Vá em Configurações → Integrações → Webhooks</li>
            <li>Adicione um novo webhook de "Pedidos"</li>
            <li>Cole a URL do webhook da integração desejada</li>
            <li>Salve e teste a integração</li>
          </ol>
        </CardContent>
      </Card>

      {/* Create Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Integração Logzz</DialogTitle>
            <DialogDescription>
              Configure uma nova integração para receber eventos da Logzz
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome da Integração</Label>
              <Input
                placeholder="Ex: Webhook de Pedidos"
                value={newIntegration.name}
                onChange={(e) => setNewIntegration(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Tipo de Evento</Label>
              <Select
                value={newIntegration.event_type}
                onValueChange={(value) => setNewIntegration(prev => ({ ...prev, event_type: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map((event) => (
                    <SelectItem key={event.value} value={event.value}>
                      {event.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Selecione o tipo de evento que deseja receber
              </p>
            </div>

            <div className="space-y-2">
              <Label>Fluxo a ser acionado (opcional)</Label>
              <Select
                value={newIntegration.flow_id || "none"}
                onValueChange={(value) => setNewIntegration(prev => ({ ...prev, flow_id: value === "none" ? "" : value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um fluxo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum fluxo</SelectItem>
                  {flows.map((flow) => (
                    <SelectItem key={flow.id} value={flow.id}>
                      {flow.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                O fluxo será acionado automaticamente quando o evento for recebido
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
              Cancelar
            </Button>
            <Button onClick={createWebhook} disabled={creating}>
              {creating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Criando...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Criar Integração
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
