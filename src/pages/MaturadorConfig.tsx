import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Save, TestTube, Loader2, CheckCircle, XCircle, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export default function MaturadorConfig() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [evolutionBaseUrl, setEvolutionBaseUrl] = useState("");
  const [evolutionApiKey, setEvolutionApiKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);

  useEffect(() => {
    const loadConfig = async () => {
      if (!user) return;

      try {
        const { data, error } = await supabase
          .from('maturador_config')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (data) {
          setEvolutionBaseUrl(data.evolution_base_url);
          setEvolutionApiKey(data.evolution_api_key);
        }
      } catch (error) {
        console.error('Error loading config:', error);
      } finally {
        setLoading(false);
      }
    };

    loadConfig();
  }, [user]);

  const handleSave = async () => {
    if (!evolutionBaseUrl || !evolutionApiKey) {
      toast.error('Preencha todos os campos');
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('maturador-evolution', {
        body: {
          action: 'save-config',
          evolutionBaseUrl,
          evolutionApiKey,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      toast.success('Configuração salva com sucesso!');
    } catch (error: any) {
      console.error('Error saving config:', error);
      toast.error(error.message || 'Erro ao salvar configuração');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!evolutionBaseUrl || !evolutionApiKey) {
      toast.error('Preencha todos os campos antes de testar');
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('maturador-evolution', {
        body: {
          action: 'test-connection',
          evolutionBaseUrl,
          evolutionApiKey,
        },
      });

      if (error) throw error;

      if (data.success) {
        setTestResult('success');
        toast.success(`Conexão OK! ${data.instances} instância(s) encontrada(s)`);
      } else {
        setTestResult('error');
        toast.error(data.error || 'Falha na conexão');
      }
    } catch (error: any) {
      console.error('Error testing connection:', error);
      setTestResult('error');
      toast.error(error.message || 'Erro ao testar conexão');
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" onClick={() => navigate('/maturador')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Configurações do Maturador</h1>
            <p className="text-muted-foreground">Configure sua Evolution API</p>
          </div>
        </div>

        {/* Info Card */}
        <Card className="mb-6 border-blue-500/50 bg-blue-500/10">
          <CardContent className="p-4">
            <h3 className="font-medium mb-2 flex items-center gap-2">
              <ExternalLink className="h-4 w-4" />
              O que é a Evolution API?
            </h3>
            <p className="text-sm text-muted-foreground mb-3">
              A Evolution API é um servidor que permite conectar múltiplas instâncias de WhatsApp. 
              Você precisa ter a Evolution API instalada em uma VPS ou servidor próprio.
            </p>
            <a 
              href="https://doc.evolution-api.com/v2/pt/get-started/introduction" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-sm text-blue-400 hover:underline flex items-center gap-1"
            >
              Ver documentação da Evolution API
              <ExternalLink className="h-3 w-3" />
            </a>
          </CardContent>
        </Card>

        {/* Config Form */}
        <Card>
          <CardHeader>
            <CardTitle>Dados da Evolution API</CardTitle>
            <CardDescription>
              Informe a URL base e a API Key global da sua Evolution API
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="baseUrl">URL Base da Evolution API</Label>
              <Input
                id="baseUrl"
                placeholder="https://sua-evolution.seudominio.com.br"
                value={evolutionBaseUrl}
                onChange={(e) => setEvolutionBaseUrl(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Exemplo: https://evolution.meudominio.com ou http://123.456.789.10:8080
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="apiKey">API Key Global</Label>
              <Input
                id="apiKey"
                type="password"
                placeholder="Sua AUTHENTICATION_API_KEY"
                value={evolutionApiKey}
                onChange={(e) => setEvolutionApiKey(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                A mesma chave configurada no arquivo .env da sua Evolution API (AUTHENTICATION_API_KEY)
              </p>
            </div>

            <div className="flex gap-3">
              <Button 
                variant="outline" 
                onClick={handleTest} 
                disabled={testing || !evolutionBaseUrl || !evolutionApiKey}
                className="flex-1"
              >
                {testing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : testResult === 'success' ? (
                  <CheckCircle className="h-4 w-4 mr-2 text-green-500" />
                ) : testResult === 'error' ? (
                  <XCircle className="h-4 w-4 mr-2 text-red-500" />
                ) : (
                  <TestTube className="h-4 w-4 mr-2" />
                )}
                Testar Conexão
              </Button>

              <Button 
                onClick={handleSave} 
                disabled={saving || !evolutionBaseUrl || !evolutionApiKey}
                className="flex-1"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Salvar Configuração
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
