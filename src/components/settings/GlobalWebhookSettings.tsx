import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ColoredSwitch } from "@/components/ui/colored-switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Copy, RefreshCw, Loader2, History, Plus, Trash2, Workflow, Smartphone, Zap, Globe } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface GlobalWebhook {
  id: string;
  webhook_token: string;
  is_active: boolean;
  created_at: string;
  name: string;
  flow_id: string | null;
  instance_id: string | null;
  flow?: { id: string; name: string } | null;
  instance?: { id: string; instance_name: string; phone_number: string | null; label: string | null } | null;
}

interface Flow {
  id: string;
  name: string;
}

interface Instance {
  id: string;
  instance_name: string;
  phone_number: string | null;
  label: string | null;
}

interface WebhookEvent {
  id: string;
  raw_payload: Record<string, unknown> | null;
  created_at: string;
}

export function GlobalWebhookSettings() {
  const { user } = useAuth();
  const [webhooks, setWebhooks] = useState<GlobalWebhook[]>([]);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [newWebhook, setNewWebhook] = useState({
    name: "",
    flow_id: "",
    instance_id: ""
  });
  const [expandedWebhook, setExpandedWebhook] = useState<string | null>(null);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [history, setHistory] = useState<Record<string, WebhookEvent[]>>({});

  const WEBHOOK_BASE_URL = "https://dcjizoulbggsavizbukq.supabase.co/functions/v1";

  useEffect(() => {
    if (user) {
      fetchWebhooks();
      fetchFlows();
      fetchInstances();

      // Subscribe to real-time flow changes
      const flowsChannel = supabase
        .channel('global-webhook-flows-realtime')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'inbox_flows',
          filter: `user_id=eq.${user.id}`
        }, () => fetchFlows())
        .subscribe();

      return () => {
        supabase.removeChannel(flowsChannel);
      };
    } else {
      setLoading(false);
    }
  }, [user]);

  // Fetch history for expanded webhook
  useEffect(() => {
    if (!user || !expandedWebhook) return;

    const webhook = webhooks.find(w => w.id === expandedWebhook);
    if (!webhook) return;

    const fetchHistory = async () => {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const webhookId = webhook.id;
      const userId = user.id;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('global_webhook_events')
        .select('id, raw_payload, created_at')
        .eq('user_id', userId)
        .eq('webhook_id', webhookId)
        .gte('created_at', twentyFourHoursAgo)
        .order('created_at', { ascending: false })
        .limit(20);

      if (!error && data) {
        setHistory(prev => ({ ...prev, [expandedWebhook]: data as WebhookEvent[] }));
      }
    };

    fetchHistory();
    const interval = setInterval(fetchHistory, 3000);

    return () => clearInterval(interval);
  }, [user, expandedWebhook, webhooks]);

  const fetchWebhooks = async () => {
    if (!user) return;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('global_webhooks')
        .select(`
          *,
          flow:inbox_flows(id, name),
          instance:maturador_instances(id, instance_name, phone_number, label)
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setWebhooks((data || []) as GlobalWebhook[]);
    } catch (error) {
      console.error('Error fetching global webhooks:', error);
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
        .order('name', { ascending: true });

      if (error) throw error;
      setFlows((data || []) as Flow[]);
    } catch (error) {
      console.error('Error fetching flows:', error);
    }
  };

  const fetchInstances = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('maturador_instances')
        .select('id, instance_name, phone_number, label')
        .eq('user_id', user.id)
        .eq('status', 'connected')
        .order('created_at', { ascending: true });

      if (error) throw error;
      setInstances((data || []) as Instance[]);
    } catch (error) {
      console.error('Error fetching instances:', error);
    }
  };

  const createWebhook = async () => {
    if (!user || !newWebhook.name.trim()) {
      toast.error("Nome da integração é obrigatório");
      return;
    }

    setCreating(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('global_webhooks')
        .insert({
          user_id: user.id,
          name: newWebhook.name.trim(),
          flow_id: newWebhook.flow_id || null,
          instance_id: newWebhook.instance_id || null,
        });

      if (error) throw error;

      toast.success("Webhook global criado!");
      setShowCreateModal(false);
      setNewWebhook({ name: "", flow_id: "", instance_id: "" });
      fetchWebhooks();
    } catch (error) {
      console.error('Error creating webhook:', error);
      toast.error("Erro ao criar webhook");
    } finally {
      setCreating(false);
    }
  };

  const toggleWebhook = async (id: string, isActive: boolean) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('global_webhooks')
        .update({ is_active: isActive })
        .eq('id', id);

      if (error) throw error;
      
      setWebhooks(prev => prev.map(w => w.id === id ? { ...w, is_active: isActive } : w));
      toast.success(isActive ? "Webhook ativado" : "Webhook desativado");
    } catch (error) {
      console.error('Error toggling webhook:', error);
      toast.error("Erro ao alterar status");
    }
  };

  const updateWebhook = async (id: string, updates: Partial<GlobalWebhook>) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('global_webhooks')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
      
      fetchWebhooks();
      toast.success("Webhook atualizado!");
    } catch (error) {
      console.error('Error updating webhook:', error);
      toast.error("Erro ao atualizar webhook");
    }
  };

  const deleteWebhook = async (id: string) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('global_webhooks')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      setWebhooks(prev => prev.filter(w => w.id !== id));
      setDeleteConfirmId(null);
      toast.success("Webhook excluído!");
    } catch (error) {
      console.error('Error deleting webhook:', error);
      toast.error("Erro ao excluir webhook");
    }
  };

  const copyUrl = (token: string) => {
    const url = `${WEBHOOK_BASE_URL}/webhook-global?token=${token}`;
    navigator.clipboard.writeText(url);
    toast.success("URL copiada!");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Globe className="h-5 w-5 text-blue-500" />
            Webhook Global
            <Badge variant="secondary" className="ml-2 bg-blue-500/20 text-blue-400">
              Novo
            </Badge>
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Receba eventos de qualquer sistema externo e dispare fluxos automaticamente
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Nova Integração
        </Button>
      </div>

      {/* Info Card */}
      <Card className="bg-blue-500/5 border-blue-500/20">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Zap className="h-5 w-5 text-blue-500 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-blue-400">Como funciona?</p>
              <p className="text-muted-foreground mt-1">
                Configure uma URL de webhook e envie qualquer payload JSON. 
                O sistema detecta automaticamente o campo de telefone (phone, telefone, client_phone, whatsapp, celular, mobile) 
                e dispara o fluxo configurado. Todos os campos do payload ficam disponíveis como variáveis com prefixo <code className="bg-blue-500/10 px-1 rounded">webhook_</code>.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Webhooks List */}
      {webhooks.length === 0 ? (
        <Card className="border-dashed">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-muted flex items-center justify-center">
              <Globe className="h-8 w-8 text-muted-foreground" />
            </div>
            <CardTitle>Nenhum webhook configurado</CardTitle>
            <CardDescription>
              Crie seu primeiro webhook global para começar a receber eventos externos
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button onClick={() => setShowCreateModal(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Criar Webhook
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {webhooks.map((webhook) => (
            <Card key={webhook.id} className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      {webhook.name}
                      {webhook.is_active ? (
                        <Badge className="bg-emerald-500/20 text-emerald-500">Ativo</Badge>
                      ) : (
                        <Badge variant="secondary">Inativo</Badge>
                      )}
                    </CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    <ColoredSwitch
                      checked={webhook.is_active}
                      onCheckedChange={(checked) => toggleWebhook(webhook.id, checked)}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setDeleteConfirmId(webhook.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Tags */}
                <div className="flex flex-wrap gap-2 mt-2">
                  {webhook.flow && (
                    <Badge variant="outline" className="gap-1">
                      <Workflow className="h-3 w-3" />
                      {webhook.flow.name}
                    </Badge>
                  )}
                  {webhook.instance && (
                    <Badge variant="outline" className="gap-1 bg-accent/10 text-accent border-accent/30">
                      <Smartphone className="h-3 w-3" />
                      {webhook.instance.phone_number || webhook.instance.label || webhook.instance.instance_name}
                    </Badge>
                  )}
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Webhook URL */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">URL do Webhook</Label>
                  <div className="flex gap-2">
                    <Input
                      value={`${WEBHOOK_BASE_URL}/webhook-global?token=${webhook.webhook_token}`}
                      readOnly
                      className="font-mono text-xs"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => copyUrl(webhook.webhook_token)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={fetchWebhooks}
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Flow Selection */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Fluxo a ser acionado</Label>
                  <Select
                    value={webhook.flow_id || ""}
                    onValueChange={(value) => updateWebhook(webhook.id, { flow_id: value || null })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um fluxo..." />
                    </SelectTrigger>
                    <SelectContent>
                      {flows.map((flow) => (
                        <SelectItem key={flow.id} value={flow.id}>
                          {flow.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Instance Selection */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground flex items-center gap-2">
                    <Smartphone className="h-3 w-3" />
                    Instância para Disparo
                  </Label>
                  <Select
                    value={webhook.instance_id || "__default__"}
                    onValueChange={(value) => updateWebhook(webhook.id, { instance_id: value === "__default__" ? null : value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Primeira conectada (padrão)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__default__">Primeira conectada (padrão)</SelectItem>
                      {instances.map((instance) => (
                        <SelectItem key={instance.id} value={instance.id}>
                          {instance.phone_number || instance.label || instance.instance_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Esta instância será usada para disparar o fluxo.
                  </p>
                </div>

                {/* History Section */}
                <Collapsible
                  open={expandedWebhook === webhook.id}
                  onOpenChange={(open) => setExpandedWebhook(open ? webhook.id : null)}
                >
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" className="w-full justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <History className="h-4 w-4" />
                        Histórico (últimas 24h)
                      </span>
                      <Badge variant="secondary">
                        {history[webhook.id]?.length || 0}
                      </Badge>
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2">
                    {history[webhook.id]?.length ? (
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {history[webhook.id].map((event) => (
                          <div
                            key={event.id}
                            className="p-2 bg-muted/50 rounded-md text-xs"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">
                                {formatDistanceToNow(new Date(event.created_at), {
                                  addSuffix: true,
                                  locale: ptBR
                                })}
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-xs"
                                onClick={() => setExpandedEvent(expandedEvent === event.id ? null : event.id)}
                              >
                                {expandedEvent === event.id ? 'Ocultar' : 'Ver payload'}
                              </Button>
                            </div>
                            {expandedEvent === event.id && event.raw_payload && (
                              <pre className="mt-2 p-2 bg-background rounded text-xs overflow-x-auto">
                                {JSON.stringify(event.raw_payload, null, 2)}
                              </pre>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground text-center py-4">
                        Nenhum evento nas últimas 24 horas
                      </p>
                    )}
                  </CollapsibleContent>
                </Collapsible>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-blue-500" />
              Nova Integração Webhook
            </DialogTitle>
            <DialogDescription>
              Configure uma nova integração para receber eventos externos
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome da Integração *</Label>
              <Input
                placeholder="Ex: Hotmart, Kiwify, Minha API..."
                value={newWebhook.name}
                onChange={(e) => setNewWebhook(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Fluxo a ser acionado</Label>
              <Select
                value={newWebhook.flow_id}
                onValueChange={(value) => setNewWebhook(prev => ({ ...prev, flow_id: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um fluxo..." />
                </SelectTrigger>
                <SelectContent>
                  {flows.map((flow) => (
                    <SelectItem key={flow.id} value={flow.id}>
                      {flow.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Instância para Disparo</Label>
              <Select
                value={newWebhook.instance_id || "__default__"}
                onValueChange={(value) => setNewWebhook(prev => ({ ...prev, instance_id: value === "__default__" ? "" : value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Primeira conectada (padrão)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__default__">Primeira conectada (padrão)</SelectItem>
                  {instances.map((instance) => (
                    <SelectItem key={instance.id} value={instance.id}>
                      {instance.phone_number || instance.label || instance.instance_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
              Cancelar
            </Button>
            <Button onClick={createWebhook} disabled={creating || !newWebhook.name.trim()}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Criar Webhook
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Webhook</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este webhook? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmId && deleteWebhook(deleteConfirmId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
