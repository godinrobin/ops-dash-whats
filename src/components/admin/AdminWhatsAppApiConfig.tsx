import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle, XCircle, Eye, EyeOff, Copy, Wifi } from "lucide-react";
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
}

export const AdminWhatsAppApiConfig = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  
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

      // Test connection based on provider
      // UazAPI docs: admin endpoints use header `admintoken`
      // Some servers expose the admin routes under different prefixes, so we probe a small set.

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (activeProvider === 'evolution') {
        headers['apikey'] = apiKey;

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

      // UazAPI
      headers['admintoken'] = apiKey;

      const candidates = [
        `${baseUrl}/admin/listInstances`,
        `${baseUrl}/api/admin/listInstances`,
        `${baseUrl}/v2/admin/listInstances`,
        `${baseUrl}/admin/instances`,
        `${baseUrl}/api/admin/instances`,
      ];

      let lastError: { status: number; statusText: string; body?: string } | null = null;

      for (const endpoint of candidates) {
        try {
          const response = await fetch(endpoint, { method: 'GET', headers });
          if (!response.ok) {
            lastError = { status: response.status, statusText: response.statusText, body: await response.text() };
            continue;
          }

          const data = await response.json();
          const count =
            (Array.isArray(data) ? data.length : 0) ||
            data?.instances?.length ||
            data?.data?.instances?.length ||
            data?.data?.length ||
            0;

          setTestResult({
            success: true,
            message: `Conexão bem-sucedida! ${count} instância(s) encontrada(s).`,
          });
          return;
        } catch (e) {
          // try next
        }
      }

      console.error('UazAPI test error:', lastError);
      setTestResult({
        success: false,
        message: `Erro: endpoint admin não encontrado. Confirme o Server URL (deve ser https://{seu-subdominio}.uazapi.com).`,
      });
      return;
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
          <div className="space-y-4 p-4 rounded-lg border border-border bg-muted/30">
            <h3 className="font-medium">Configuração UazAPI</h3>
            
            <div className="space-y-2">
              <Label htmlFor="uazapi-url">Server URL</Label>
              <div className="flex gap-2">
                <Input
                  id="uazapi-url"
                  placeholder="https://zapdata.uazapi.com"
                  value={uazapiBaseUrl}
                  onChange={(e) => setUazapiBaseUrl(e.target.value)}
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(uazapiBaseUrl)}
                  disabled={!uazapiBaseUrl}
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
                    type={showUazapiToken ? 'text' : 'password'}
                    placeholder="Seu Admin Token"
                    value={uazapiToken}
                    onChange={(e) => setUazapiToken(e.target.value)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full"
                    onClick={() => setShowUazapiToken(!showUazapiToken)}
                  >
                    {showUazapiToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(uazapiToken)}
                  disabled={!uazapiToken}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Test Result */}
        {testResult && (
          <div className={`flex items-center gap-2 p-3 rounded-lg ${
            testResult.success 
              ? 'bg-green-500/10 text-green-500 border border-green-500/20' 
              : 'bg-red-500/10 text-red-500 border border-red-500/20'
          }`}>
            {testResult.success ? (
              <CheckCircle className="h-5 w-5" />
            ) : (
              <XCircle className="h-5 w-5" />
            )}
            <span className="text-sm">{testResult.message}</span>
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
