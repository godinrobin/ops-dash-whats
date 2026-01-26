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
import { Copy, RefreshCw, ExternalLink, Package, Clock, CheckCircle2, Loader2, History, XCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface LogzzWebhook {
  id: string;
  webhook_token: string;
  is_active: boolean;
  created_at: string;
}

interface WebhookHistoryItem {
  id: string;
  order_number: string | null;
  client_name: string | null;
  order_status: string | null;
  created_at: string;
}

export function LogzzIntegrationSettings() {
  const { user } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdminStatus();
  const [webhook, setWebhook] = useState<LogzzWebhook | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [history, setHistory] = useState<WebhookHistoryItem[]>([]);

  const WEBHOOK_BASE_URL = "https://dcjizoulbggsavizbukq.supabase.co/functions/v1/webhook-logzz-order";

  useEffect(() => {
    if (user && isAdmin) {
      fetchWebhook();
    } else {
      setLoading(false);
    }
  }, [user, isAdmin]);

  // Fetch recent webhook history (last 30 seconds)
  useEffect(() => {
    if (!user || !isAdmin || !webhook?.is_active) return;

    const fetchHistory = async () => {
      const thirtySecondsAgo = new Date(Date.now() - 30000).toISOString();
      const { data, error } = await supabase
        .from('logzz_orders')
        .select('id, order_number, client_name, order_status, created_at')
        .eq('user_id', user.id)
        .gte('created_at', thirtySecondsAgo)
        .order('created_at', { ascending: false })
        .limit(10);

      if (!error && data) {
        setHistory(data as WebhookHistoryItem[]);
      }
    };

    fetchHistory();
    const interval = setInterval(fetchHistory, 3000); // Poll every 3 seconds

    return () => clearInterval(interval);
  }, [user, isAdmin, webhook?.is_active]);

  const fetchWebhook = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('logzz_webhooks')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      setWebhook(data as LogzzWebhook | null);
    } catch (error) {
      console.error('Error fetching webhook:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateWebhook = async () => {
    if (!user) return;

    setGenerating(true);
    try {
      const { data, error } = await supabase
        .from('logzz_webhooks')
        .insert({ user_id: user.id })
        .select()
        .single();

      if (error) throw error;
      setWebhook(data as LogzzWebhook);
      toast.success('Webhook gerado com sucesso!');
    } catch (error) {
      console.error('Error generating webhook:', error);
      toast.error('Erro ao gerar webhook');
    } finally {
      setGenerating(false);
    }
  };

  const regenerateWebhook = async () => {
    if (!user || !webhook) return;

    setRegenerating(true);
    try {
      const newToken = crypto.randomUUID();
      const { data, error } = await supabase
        .from('logzz_webhooks')
        .update({ webhook_token: newToken })
        .eq('id', webhook.id)
        .select()
        .single();

      if (error) throw error;
      setWebhook(data as LogzzWebhook);
      toast.success('Webhook regenerado com sucesso!');
    } catch (error) {
      console.error('Error regenerating webhook:', error);
      toast.error('Erro ao regenerar webhook');
    } finally {
      setRegenerating(false);
    }
  };

  const toggleWebhook = async (active: boolean) => {
    if (!webhook) return;

    try {
      const { error } = await supabase
        .from('logzz_webhooks')
        .update({ is_active: active })
        .eq('id', webhook.id);

      if (error) throw error;
      setWebhook({ ...webhook, is_active: active });
      toast.success(active ? 'Webhook ativado!' : 'Webhook desativado!');
    } catch (error) {
      console.error('Error toggling webhook:', error);
      toast.error('Erro ao alterar status do webhook');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copiado para a área de transferência!');
  };

  const getWebhookUrl = () => {
    if (!webhook) return '';
    return `${WEBHOOK_BASE_URL}?token=${webhook.webhook_token}`;
  };

  if (adminLoading || loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Se não é admin, mostra "Em Breve"
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
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Integração Logzz - Pedidos
              </CardTitle>
              <CardDescription>
                Receba webhooks de pedidos da plataforma Logzz
              </CardDescription>
            </div>
            {webhook && (
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
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!webhook ? (
            <div className="text-center py-6">
              <p className="text-muted-foreground mb-4">
                Gere um webhook para integrar com a Logzz
              </p>
              <Button onClick={generateWebhook} disabled={generating}>
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Gerando...
                  </>
                ) : (
                  'Gerar Webhook'
                )}
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label>URL do Webhook</Label>
                <div className="flex gap-2">
                  <Input 
                    value={getWebhookUrl()} 
                    readOnly 
                    className="font-mono text-sm"
                  />
                  <Button 
                    variant="outline" 
                    size="icon"
                    onClick={() => copyToClipboard(getWebhookUrl())}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Cole esta URL na configuração de webhook da Logzz
                </p>
              </div>

              <div className="flex items-center justify-between pt-4 border-t">
                <div className="flex items-center gap-2">
                  <ColoredSwitch 
                    checked={webhook.is_active}
                    onCheckedChange={toggleWebhook}
                  />
                  <Label>Webhook ativo</Label>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={regenerateWebhook}
                  disabled={regenerating}
                >
                  {regenerating ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Regenerar Token
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Histórico de requisições - últimos 30s */}
      {webhook?.is_active && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <History className="h-5 w-5" />
              Histórico de Requisições
              <Badge variant="outline" className="ml-2">
                Últimos 30s
              </Badge>
            </CardTitle>
            <CardDescription>
              Requisições recebidas nos últimos 30 segundos (atualiza automaticamente)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Nenhuma requisição nos últimos 30 segundos</p>
                <p className="text-xs mt-1">As requisições aparecerão aqui quando recebidas</p>
              </div>
            ) : (
              <div className="space-y-2">
                {history.map((item) => (
                  <div 
                    key={item.id} 
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                      <div>
                        <p className="font-medium text-sm">
                          {item.order_number || 'Pedido sem número'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.client_name || 'Cliente não informado'} • {item.order_status || 'Status não informado'}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(item.created_at), { addSuffix: true, locale: ptBR })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Como configurar na Logzz</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <ol className="list-decimal list-inside space-y-2">
            <li>Acesse <a href="https://app.logzz.com.br/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">app.logzz.com.br</a></li>
            <li>Vá em Configurações → Integrações → Webhooks</li>
            <li>Adicione um novo webhook de "Pedidos"</li>
            <li>Cole a URL do webhook gerada acima</li>
            <li>Salve e teste a integração</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
