import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, CheckCircle, XCircle, Eye, EyeOff, Copy, Wifi, Search, AlertTriangle, Settings, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface WhatsAppApiConfig {
  id: string;
  active_provider: 'evolution' | 'uazapi';
  evolution_base_url: string | null;
  evolution_api_key: string | null;
  uazapi_base_url: string | null;
  uazapi_api_token: string | null;
  updated_at: string;
  uazapi_api_prefix?: string | null;
  uazapi_admin_header?: string | null;
  uazapi_list_instances_path?: string | null;
  uazapi_list_instances_method?: string | null;
}

interface ProbeResult {
  path: string;
  method: string;
  status: number;
  statusText: string;
  isSuccess: boolean;
  bodyPreview?: string;
}

interface ProbeResponse {
  serverOnline: boolean;
  statusEndpoint?: { status: number; body?: any };
  adminEndpointFound: boolean;
  detectedConfig?: {
    prefix: string;
    listInstancesPath: string;
    listInstancesMethod: string;
    headerKey: string;
  };
  probeResults: ProbeResult[];
  recommendation?: string;
  error?: string;
}

// UazAPI Config Component with Manual Mode
const UazAPIConfig = ({
  baseUrl,
  setBaseUrl,
  token,
  setToken,
  showToken,
  setShowToken,
  copyToClipboard,
  config,
}: {
  baseUrl: string;
  setBaseUrl: (v: string) => void;
  token: string;
  setToken: (v: string) => void;
  showToken: boolean;
  setShowToken: (v: boolean) => void;
  copyToClipboard: (v: string) => void;
  config: WhatsAppApiConfig | null;
}) => {
  const [manualMode, setManualMode] = useState(false);
  const [manualPrefix, setManualPrefix] = useState(config?.uazapi_api_prefix || '');
  const [manualPath, setManualPath] = useState(config?.uazapi_list_instances_path || '/admin/listInstances');
  const [manualMethod, setManualMethod] = useState(config?.uazapi_list_instances_method || 'GET');
  const [manualHeader, setManualHeader] = useState(config?.uazapi_admin_header || 'admintoken');
  const [savingManual, setSavingManual] = useState(false);

  useEffect(() => {
    if (config) {
      setManualPrefix(config.uazapi_api_prefix || '');
      setManualPath(config.uazapi_list_instances_path || '/admin/listInstances');
      setManualMethod(config.uazapi_list_instances_method || 'GET');
      setManualHeader(config.uazapi_admin_header || 'admintoken');
    }
  }, [config]);

  const saveManualConfig = async () => {
    if (!config?.id) {
      toast.error('Salve a configuração principal primeiro');
      return;
    }

    setSavingManual(true);
    try {
      const { error } = await supabase
        .from('whatsapp_api_config')
        .update({
          uazapi_api_prefix: manualPrefix || null,
          uazapi_list_instances_path: manualPath || null,
          uazapi_list_instances_method: manualMethod || null,
          uazapi_admin_header: manualHeader || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', config.id);

      if (error) throw error;
      toast.success('Configuração manual salva!');
    } catch (err) {
      console.error('Error saving manual config:', err);
      toast.error('Erro ao salvar configuração manual');
    } finally {
      setSavingManual(false);
    }
  };

  return (
    <div className="space-y-4 p-4 rounded-lg border border-border bg-muted/30">
      <h3 className="font-medium">Configuração UazAPI</h3>
      
      <div className="space-y-2">
        <Label htmlFor="uazapi-url">Server URL</Label>
        <div className="flex gap-2">
          <Input
            id="uazapi-url"
            placeholder="https://zapdata.uazapi.com"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
          <Button
            variant="outline"
            size="icon"
            onClick={() => copyToClipboard(baseUrl)}
            disabled={!baseUrl}
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="uazapi-token">Admin Token</Label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              id="uazapi-token"
              type={showToken ? 'text' : 'password'}
              placeholder="Seu Admin Token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 h-full"
              onClick={() => setShowToken(!showToken)}
            >
              {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => copyToClipboard(token)}
            disabled={!token}
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Manual Configuration Section */}
      <Collapsible open={manualMode} onOpenChange={setManualMode}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full justify-between text-muted-foreground hover:text-foreground">
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              <span className="text-sm">Configuração Manual de Endpoints</span>
            </div>
            <ChevronDown className={`h-4 w-4 transition-transform ${manualMode ? 'rotate-180' : ''}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-4 border-t border-border/50 mt-2">
          <p className="text-xs text-muted-foreground">
            Use esta seção se a detecção automática falhar. Configure manualmente os endpoints da sua API UazAPI.
          </p>
          
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Prefixo da API</Label>
              <Select value={manualPrefix} onValueChange={setManualPrefix}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">(nenhum)</SelectItem>
                  <SelectItem value="/api">/api</SelectItem>
                  <SelectItem value="/v1">/v1</SelectItem>
                  <SelectItem value="/v2">/v2</SelectItem>
                  <SelectItem value="/api/v2">/api/v2</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Método HTTP</Label>
              <Select value={manualMethod} onValueChange={setManualMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GET">GET</SelectItem>
                  <SelectItem value="POST">POST</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Path para Listar Instâncias</Label>
            <Input
              placeholder="/admin/listInstances"
              value={manualPath}
              onChange={(e) => setManualPath(e.target.value)}
              className="font-mono text-sm"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Header de Autenticação</Label>
            <Select value={manualHeader} onValueChange={setManualHeader}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admintoken">admintoken</SelectItem>
                <SelectItem value="AdminToken">AdminToken</SelectItem>
                <SelectItem value="Authorization">Authorization (Bearer)</SelectItem>
                <SelectItem value="apikey">apikey</SelectItem>
                <SelectItem value="x-admin-token">x-admin-token</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button 
            onClick={saveManualConfig} 
            disabled={savingManual}
            size="sm"
            className="w-full"
          >
            {savingManual ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              'Salvar Configuração Manual'
            )}
          </Button>

          {(config?.uazapi_api_prefix || config?.uazapi_list_instances_path) && (
            <div className="text-xs text-muted-foreground bg-muted p-2 rounded">
              <strong>Configuração atual:</strong><br />
              {config.uazapi_list_instances_method || 'GET'}{' '}
              {config.uazapi_api_prefix || ''}{config.uazapi_list_instances_path || '/admin/listInstances'}<br />
              Header: {config.uazapi_admin_header || 'admintoken'}
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

export const AdminWhatsAppApiConfig = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; details?: ProbeResponse } | null>(null);
  
  const [config, setConfig] = useState<WhatsAppApiConfig | null>(null);
  const [activeProvider, setActiveProvider] = useState<'evolution' | 'uazapi'>('uazapi');
  
  // Evolution fields
  const [evolutionBaseUrl, setEvolutionBaseUrl] = useState('');
  const [evolutionApiKey, setEvolutionApiKey] = useState('');
  const [showEvolutionKey, setShowEvolutionKey] = useState(false);
  
  // UazAPI fields
  const [uazapiBaseUrl, setUazapiBaseUrl] = useState('https://zapdata.uazapi.com');
  const [uazapiToken, setUazapiToken] = useState('');
  const [showUazapiToken, setShowUazapiToken] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('whatsapp_api_config')
        .select('*')
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setConfig(data as WhatsAppApiConfig);
        setActiveProvider(data.active_provider as 'evolution' | 'uazapi');
        setEvolutionBaseUrl(data.evolution_base_url || '');
        setEvolutionApiKey(data.evolution_api_key || '');
        setUazapiBaseUrl(data.uazapi_base_url || 'https://zapdata.uazapi.com');
        setUazapiToken(data.uazapi_api_token || '');
      }
    } catch (err) {
      console.error('Error loading WhatsApp API config:', err);
      toast.error('Erro ao carregar configuração');
    } finally {
      setLoading(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      let baseUrl = '';
      let apiKey = '';

      if (activeProvider === 'evolution') {
        baseUrl = evolutionBaseUrl;
        apiKey = evolutionApiKey;
      } else {
        baseUrl = uazapiBaseUrl;
        apiKey = uazapiToken;
      }

      if (!baseUrl || !apiKey) {
        setTestResult({ success: false, message: 'Preencha a URL e a chave API' });
        return;
      }

      // Clean URL
      baseUrl = baseUrl.replace(/\/$/, '');

      // Evolution: test directly
      if (activeProvider === 'evolution') {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'apikey': apiKey,
        };

        const endpoint = `${baseUrl}/instance/fetchInstances`;
        const response = await fetch(endpoint, { method: 'GET', headers });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('API test error:', errorText);
          setTestResult({ success: false, message: `Erro ${response.status}: ${response.statusText}` });
          return;
        }

        const data = await response.json();
        const count = Array.isArray(data) ? data.length : (data?.instances?.length || 0);
        setTestResult({ success: true, message: `Conexão bem-sucedida! ${count} instância(s) encontrada(s).` });
        return;
      }

      // UazAPI: use the probe function for comprehensive testing
      setTestResult({ success: false, message: 'Detectando endpoints UazAPI...' });

      const { data: probeData, error: probeError } = await supabase.functions.invoke('uazapi-probe', {
        body: { baseUrl, adminToken: apiKey },
      });

      if (probeError) {
        console.error('Probe error:', probeError);
        setTestResult({ 
          success: false, 
          message: `Erro ao executar diagnóstico: ${probeError.message}` 
        });
        return;
      }

      const probe = probeData as ProbeResponse;

      if (probe.error) {
        setTestResult({ success: false, message: probe.error, details: probe });
        return;
      }

      if (!probe.serverOnline) {
        setTestResult({ 
          success: false, 
          message: 'Servidor não está respondendo. Verifique a URL base.',
          details: probe 
        });
        return;
      }

      if (probe.adminEndpointFound && probe.detectedConfig) {
        const config = probe.detectedConfig;
        setTestResult({ 
          success: true, 
          message: `Conexão bem-sucedida! Endpoint detectado: ${config.listInstancesMethod} ${config.prefix}${config.listInstancesPath}`,
          details: probe
        });
        // Reload config to show saved values
        await loadConfig();
        return;
      }

      // Not found
      let message = 'Servidor online, mas endpoint admin não encontrado.';
      if (probe.recommendation) {
        message = probe.recommendation;
      }
      if (probe.probeResults.length > 0) {
        const attempts = probe.probeResults.slice(0, 3).map(r => `${r.method} ${r.path} (${r.status})`).join(', ');
        message += ` Tentativas: ${attempts}`;
      }
      setTestResult({ success: false, message, details: probe });
    } catch (err: any) {
      console.error('Connection test error:', err);
      setTestResult({ 
        success: false, 
        message: err.message || 'Não foi possível conectar à API' 
      });
    } finally {
      setTesting(false);
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      const updateData = {
        active_provider: activeProvider,
        evolution_base_url: evolutionBaseUrl || null,
        evolution_api_key: evolutionApiKey || null,
        uazapi_base_url: uazapiBaseUrl || null,
        uazapi_api_token: uazapiToken || null,
        updated_at: new Date().toISOString(),
      };

      if (config?.id) {
        const { error } = await supabase
          .from('whatsapp_api_config')
          .update(updateData)
          .eq('id', config.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('whatsapp_api_config')
          .insert(updateData);

        if (error) throw error;
      }

      toast.success('Configuração salva com sucesso!');
      await loadConfig();
    } catch (err) {
      console.error('Error saving config:', err);
      toast.error('Erro ao salvar configuração');
    } finally {
      setSaving(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copiado!');
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wifi className="h-5 w-5 text-accent" />
          Configurar API WhatsApp
        </CardTitle>
        <CardDescription>
          Escolha qual API será usada para novas conexões de WhatsApp. Instâncias existentes continuam usando a API com que foram criadas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Provider Selection */}
        <div className="space-y-3">
          <Label className="text-base font-medium">Provedor Ativo</Label>
          <RadioGroup
            value={activeProvider}
            onValueChange={(v) => {
              setActiveProvider(v as 'evolution' | 'uazapi');
              setTestResult(null);
            }}
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            <div className={`relative flex items-center space-x-3 rounded-lg border p-4 cursor-pointer transition-all ${
              activeProvider === 'evolution' 
                ? 'border-accent bg-accent/5' 
                : 'border-border hover:border-muted-foreground/50'
            }`}>
              <RadioGroupItem value="evolution" id="evolution" />
              <Label htmlFor="evolution" className="flex-1 cursor-pointer">
                <div className="font-semibold">Evolution API</div>
                <div className="text-sm text-muted-foreground">
                  API self-hosted tradicional
                </div>
              </Label>
              {activeProvider === 'evolution' && (
                <Badge className="bg-accent text-accent-foreground">Ativo</Badge>
              )}
            </div>

            <div className={`relative flex items-center space-x-3 rounded-lg border p-4 cursor-pointer transition-all ${
              activeProvider === 'uazapi' 
                ? 'border-accent bg-accent/5' 
                : 'border-border hover:border-muted-foreground/50'
            }`}>
              <RadioGroupItem value="uazapi" id="uazapi" />
              <Label htmlFor="uazapi" className="flex-1 cursor-pointer">
                <div className="font-semibold">UazAPI</div>
                <div className="text-sm text-muted-foreground">
                  API gerenciada na nuvem
                </div>
              </Label>
              {activeProvider === 'uazapi' && (
                <Badge className="bg-accent text-accent-foreground">Ativo</Badge>
              )}
            </div>
          </RadioGroup>
        </div>

        {/* Conditional Fields based on provider */}
        {activeProvider === 'evolution' ? (
          <div className="space-y-4 p-4 rounded-lg border border-border bg-muted/30">
            <h3 className="font-medium">Configuração Evolution API</h3>
            
            <div className="space-y-2">
              <Label htmlFor="evolution-url">Base URL</Label>
              <div className="flex gap-2">
                <Input
                  id="evolution-url"
                  placeholder="https://api.evolution.com"
                  value={evolutionBaseUrl}
                  onChange={(e) => setEvolutionBaseUrl(e.target.value)}
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(evolutionBaseUrl)}
                  disabled={!evolutionBaseUrl}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="evolution-key">API Key</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="evolution-key"
                    type={showEvolutionKey ? 'text' : 'password'}
                    placeholder="Sua API Key"
                    value={evolutionApiKey}
                    onChange={(e) => setEvolutionApiKey(e.target.value)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full"
                    onClick={() => setShowEvolutionKey(!showEvolutionKey)}
                  >
                    {showEvolutionKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(evolutionApiKey)}
                  disabled={!evolutionApiKey}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <UazAPIConfig
            baseUrl={uazapiBaseUrl}
            setBaseUrl={setUazapiBaseUrl}
            token={uazapiToken}
            setToken={setUazapiToken}
            showToken={showUazapiToken}
            setShowToken={setShowUazapiToken}
            copyToClipboard={copyToClipboard}
            config={config}
          />
        )}

        {/* Test Result */}
        {testResult && (
          <div className="space-y-3">
            <div className={`flex items-start gap-2 p-3 rounded-lg ${
              testResult.success 
                ? 'bg-green-500/10 text-green-500 border border-green-500/20' 
                : 'bg-red-500/10 text-red-500 border border-red-500/20'
            }`}>
              {testResult.success ? (
                <CheckCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
              ) : (
                <XCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
              )}
              <span className="text-sm">{testResult.message}</span>
            </div>

            {/* Detailed probe results for UazAPI */}
            {testResult.details && activeProvider === 'uazapi' && (
              <div className="text-xs space-y-2 p-3 rounded-lg bg-muted/50 border border-border">
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4" />
                  <span className="font-medium">Diagnóstico UazAPI</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                  <div>Servidor Online:</div>
                  <div>{testResult.details.serverOnline ? '✅ Sim' : '❌ Não'}</div>
                  
                  <div>Status Endpoint:</div>
                  <div>{testResult.details.statusEndpoint?.status || 'N/A'}</div>
                  
                  <div>Endpoint Admin:</div>
                  <div>{testResult.details.adminEndpointFound ? '✅ Encontrado' : '❌ Não encontrado'}</div>
                </div>

                {testResult.details.detectedConfig && (
                  <div className="pt-2 border-t border-border/50 space-y-1">
                    <div className="font-medium text-foreground">Configuração Detectada:</div>
                    <div className="font-mono text-muted-foreground">
                      {testResult.details.detectedConfig.listInstancesMethod}{' '}
                      {testResult.details.detectedConfig.prefix}
                      {testResult.details.detectedConfig.listInstancesPath}
                    </div>
                    <div className="text-muted-foreground">
                      Header: <code className="bg-muted px-1 rounded">{testResult.details.detectedConfig.headerKey}</code>
                    </div>
                  </div>
                )}

                {testResult.details.probeResults && testResult.details.probeResults.length > 0 && !testResult.details.adminEndpointFound && (
                  <div className="pt-2 border-t border-border/50">
                    <div className="flex items-center gap-1 font-medium text-foreground mb-1">
                      <AlertTriangle className="h-3 w-3" />
                      Endpoints testados:
                    </div>
                    <div className="space-y-1">
                      {testResult.details.probeResults.slice(0, 5).map((r, i) => (
                        <div key={i} className="font-mono text-muted-foreground">
                          {r.method} {r.path} → {r.status} {r.statusText}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-4 border-t border-border">
          <Button
            variant="outline"
            onClick={testConnection}
            disabled={testing}
          >
            {testing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Testando...
              </>
            ) : (
              <>
                <Wifi className="h-4 w-4 mr-2" />
                Testar Conexão
              </>
            )}
          </Button>
          
          <Button
            onClick={saveConfig}
            disabled={saving}
            className="bg-accent hover:bg-accent/90"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              'Salvar Configuração'
            )}
          </Button>
        </div>

        {/* Info */}
        <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
          <strong>Nota:</strong> Alterar o provedor ativo afeta apenas novas conexões. 
          Instâncias já conectadas continuam funcionando normalmente com sua API original.
        </div>
      </CardContent>
    </Card>
  );
};
