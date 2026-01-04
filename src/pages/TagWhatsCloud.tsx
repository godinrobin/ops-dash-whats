import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ColoredSwitch } from "@/components/ui/colored-switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Cloud, Plus, RefreshCw, QrCode, Settings, Image, FileText, CheckCircle2, XCircle, Loader2, Trash2, TrendingUp, ShoppingBag, Clock, Monitor, Apple, Download } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useActivityTracker } from "@/hooks/useActivityTracker";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminStatus } from "@/hooks/useAdminStatus";
import { useEffectiveUser } from "@/hooks/useEffectiveUser";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { toZonedTime } from "date-fns-tz";

// List of emails allowed to access new Tag Whats Cloud (in addition to admins)
const ALLOWED_TAGWHATS_EMAILS = [
  'ewerton@metricas.local',
  'patrickrjo@gmail.com',
];

interface Instance {
  id: string;
  instance_name: string;
  phone_number: string | null;
  status: string;
  uazapi_token: string | null;
  label: string | null;
}

interface TagWhatsConfig {
  id: string;
  instance_id: string;
  is_active: boolean;
  filter_images: boolean;
  filter_pdfs: boolean;
  pago_label_id: string | null;
  created_at: string;
}

interface TagWhatsLog {
  id: string;
  instance_id: string;
  created_at: string;
  label_applied: boolean;
}

// Generate colors for chart lines
const CHART_COLORS = [
  '#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', 
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
];

// Old version component for users without access
const TagWhatsCloudOldVersion = () => {
  const navigate = useNavigate();
  
  useEffect(() => {
    // Load VTURB optimization script
    const optimizationScript = document.createElement("script");
    optimizationScript.innerHTML = `!function(i,n){i._plt=i._plt||(n&&n.timeOrigin?n.timeOrigin+n.now():Date.now())}(window,performance);`;
    document.head.appendChild(optimizationScript);

    const preloadPlayer = document.createElement("link");
    preloadPlayer.rel = "preload";
    preloadPlayer.href = "https://scripts.converteai.net/574be7f8-d9bf-450a-9bfb-e024758a6c13/players/693ddbc2b50e82e7e2e1a233/v4/player.js";
    preloadPlayer.as = "script";
    document.head.appendChild(preloadPlayer);

    const playerScript = document.createElement("script");
    playerScript.src = "https://scripts.converteai.net/574be7f8-d9bf-450a-9bfb-e024758a6c13/players/693ddbc2b50e82e7e2e1a233/v4/player.js";
    playerScript.async = true;
    document.head.appendChild(playerScript);

    return () => {
      try {
        document.head.removeChild(optimizationScript);
        document.head.removeChild(preloadPlayer);
        document.head.removeChild(playerScript);
      } catch {}
    };
  }, []);

  return (
    <>
      <Header />
      <div className="h-14 md:h-16" />
      <div className="min-h-screen bg-background p-6 md:p-10">
        <div className="container mx-auto max-w-4xl">
          <Button
            variant="ghost"
            onClick={() => navigate("/tag-whats")}
            className="mb-6"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>

          <header className="text-center mb-8">
            <div className="flex items-center justify-center gap-3 mb-2">
              <Cloud className="h-8 w-8 text-emerald-500" />
              <h1 className="text-3xl md:text-4xl font-bold">Tag Whats Cloud</h1>
              <Badge variant="outline" className="text-yellow-500 border-yellow-500/50">
                <Clock className="h-3 w-3 mr-1" />
                Em breve
              </Badge>
            </div>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              A versão Cloud do Tag Whats estará disponível em breve. Por enquanto, utilize a versão Local.
            </p>
          </header>

          {/* Video Container */}
          <Card className="border-2 border-accent mb-8">
            <CardContent className="p-4 md:p-6">
              <div 
                className="w-full"
                dangerouslySetInnerHTML={{
                  __html: '<vturb-smartplayer id="vid-693ddbc2b50e82e7e2e1a233" style="display: block; margin: 0 auto; width: 100%;"></vturb-smartplayer>'
                }}
              />
            </CardContent>
          </Card>

          {/* Download Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="border-2 border-accent hover:border-accent/80 transition-colors">
              <CardHeader className="text-center">
                <div className="mx-auto w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mb-2">
                  <Monitor className="h-8 w-8 text-accent" />
                </div>
                <CardTitle className="text-xl">Windows</CardTitle>
              </CardHeader>
              <CardContent className="text-center">
                <p className="text-muted-foreground mb-4">
                  Baixe a versão para Windows
                </p>
                <Button 
                  onClick={() => window.open("https://joaolucassps.co/Tag%20Whats%20Setup%201.0.0.zip", "_blank")}
                  className="w-full bg-accent hover:bg-accent/90"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Baixar para Windows
                </Button>
              </CardContent>
            </Card>

            <Card className="border-2 border-accent hover:border-accent/80 transition-colors">
              <CardHeader className="text-center">
                <div className="mx-auto w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mb-2">
                  <Apple className="h-8 w-8 text-accent" />
                </div>
                <CardTitle className="text-xl">macOS</CardTitle>
              </CardHeader>
              <CardContent className="text-center">
                <p className="text-muted-foreground mb-4">
                  Baixe a versão para macOS
                </p>
                <Button 
                  onClick={() => window.open("https://joaolucassps.co/Tag-Whats-1.0.0-arm64.dmg.zip", "_blank")}
                  className="w-full bg-accent hover:bg-accent/90"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Baixar para macOS
                </Button>
              </CardContent>
            </Card>
          </div>

          <footer className="mt-16 text-center text-xs text-muted-foreground/50">
            Criado por <a href="https://instagram.com/joaolucassps" target="_blank" rel="noopener noreferrer" className="hover:text-muted-foreground transition-colors">@joaolucassps</a>
          </footer>
        </div>
      </div>
    </>
  );
};

const TagWhatsCloud = () => {
  useActivityTracker("page_visit", "Tag Whats Cloud");
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isAdmin } = useAdminStatus();
  const { effectiveUserId, effectiveEmail } = useEffectiveUser();

  const [instances, setInstances] = useState<Instance[]>([]);
  const [configs, setConfigs] = useState<TagWhatsConfig[]>([]);
  const [logs, setLogs] = useState<TagWhatsLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [selectedInstance, setSelectedInstance] = useState<Instance | null>(null);
  const [filterImages, setFilterImages] = useState(true);
  const [filterPdfs, setFilterPdfs] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [configToDelete, setConfigToDelete] = useState<string | null>(null);
  const [chartPeriod, setChartPeriod] = useState<'7' | '30'>('7');

  const fetchData = useCallback(async () => {
    const userId = effectiveUserId || user?.id;
    if (!userId) return;
    setLoading(true);
    try {
      // Fetch UazAPI instances
      const { data: instancesData, error: instancesError } = await supabase
        .from('maturador_instances')
        .select('id, instance_name, phone_number, status, uazapi_token, label')
        .eq('user_id', userId)
        .not('uazapi_token', 'is', null) as any;

      if (instancesError) throw instancesError;
      setInstances(instancesData || []);

      // Fetch Tag Whats configs
      const { data: configsData, error: configsError } = await (supabase
        .from('tag_whats_configs' as any)
        .select('*')
        .eq('user_id', userId) as any);

      if (configsError) throw configsError;
      setConfigs(configsData || []);

      // Fetch logs for chart (last 30 days to cover both filter options)
      const thirtyDaysAgo = subDays(new Date(), 30).toISOString();
      const { data: logsData, error: logsError } = await (supabase
        .from('tag_whats_logs' as any)
        .select('id, instance_id, created_at, label_applied')
        .eq('user_id', userId)
        .eq('label_applied', true)
        .gte('created_at', thirtyDaysAgo) as any);

      if (logsError) throw logsError;
      setLogs(logsData || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  }, [user, effectiveUserId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const getConfigForInstance = (instanceId: string) => {
    return configs.find(c => c.instance_id === instanceId);
  };

  const handleOpenConfig = (instance: Instance) => {
    const existingConfig = getConfigForInstance(instance.id);
    setSelectedInstance(instance);
    setFilterImages(existingConfig?.filter_images ?? true);
    setFilterPdfs(existingConfig?.filter_pdfs ?? true);
    setConfigModalOpen(true);
  };

  const handleSaveConfig = async () => {
    if (!selectedInstance || !user) return;
    setSaving(true);

    try {
      const existingConfig = getConfigForInstance(selectedInstance.id);

      if (existingConfig) {
        // Update existing config
        const { error } = await (supabase
          .from('tag_whats_configs' as any)
          .update({
            filter_images: filterImages,
            filter_pdfs: filterPdfs,
            is_active: true,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingConfig.id) as any);

        if (error) throw error;
        toast.success('Configuração atualizada!');
      } else {
        // Create new config
        const { error } = await (supabase
          .from('tag_whats_configs' as any)
          .insert({
            user_id: user.id,
            instance_id: selectedInstance.id,
            filter_images: filterImages,
            filter_pdfs: filterPdfs,
            is_active: true
          }) as any);

        if (error) throw error;
        toast.success('Tag Whats ativado para este número!');
      }

      setConfigModalOpen(false);
      fetchData();
    } catch (error) {
      console.error('Error saving config:', error);
      toast.error('Erro ao salvar configuração');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (configId: string, isActive: boolean) => {
    try {
      const { error } = await (supabase
        .from('tag_whats_configs' as any)
        .update({ is_active: isActive, updated_at: new Date().toISOString() })
        .eq('id', configId) as any);

      if (error) throw error;
      toast.success(isActive ? 'Tag Whats ativado!' : 'Tag Whats desativado!');
      fetchData();
    } catch (error) {
      console.error('Error toggling config:', error);
      toast.error('Erro ao alterar configuração');
    }
  };

  const handleDeleteConfig = async () => {
    if (!configToDelete) return;
    try {
      const { error } = await (supabase
        .from('tag_whats_configs' as any)
        .delete()
        .eq('id', configToDelete) as any);

      if (error) throw error;
      toast.success('Configuração removida');
      setDeleteDialogOpen(false);
      setConfigToDelete(null);
      fetchData();
    } catch (error) {
      console.error('Error deleting config:', error);
      toast.error('Erro ao remover configuração');
    }
  };

  const connectedInstances = instances.filter(i => i.status === 'connected');
  const configuredInstanceIds = configs.map(c => c.instance_id);
  const availableInstances = connectedInstances.filter(i => !configuredInstanceIds.includes(i.id));

  // Calculate total labels applied (all time)
  const totalLabelsApplied = logs.length;

  // Get instance name by ID
  const getInstanceName = (instanceId: string) => {
    const instance = instances.find(i => i.id === instanceId);
    return instance?.phone_number || instance?.instance_name || 'Desconhecido';
  };

  // Get unique instance IDs that have logs
  const instancesWithLogs = useMemo(() => {
    const ids = new Set(logs.map(l => l.instance_id));
    return Array.from(ids);
  }, [logs]);

  // Prepare chart data
  const chartData = useMemo(() => {
    const days = parseInt(chartPeriod);
    const result: any[] = [];
    const spTimezone = 'America/Sao_Paulo';

    for (let i = days - 1; i >= 0; i--) {
      const date = subDays(new Date(), i);
      const zonedDate = toZonedTime(date, spTimezone);
      const dayStart = startOfDay(zonedDate);
      const dayEnd = endOfDay(zonedDate);
      const dateStr = format(zonedDate, 'dd/MM');

      const dayData: any = { date: dateStr };
      
      // Count labels for each instance on this day
      instancesWithLogs.forEach((instanceId) => {
        const count = logs.filter(l => {
          const logDate = toZonedTime(new Date(l.created_at), spTimezone);
          return l.instance_id === instanceId && 
                 logDate >= dayStart && 
                 logDate <= dayEnd;
        }).length;
        dayData[instanceId] = count;
      });

      result.push(dayData);
    }

    return result;
  }, [logs, chartPeriod, instancesWithLogs]);


  return (
    <>
      <Header />
      <div className="h-14 md:h-16" />
      <div className="min-h-screen bg-background p-6 md:p-10">
        <div className="container mx-auto max-w-5xl">
          <Button
            variant="ghost"
            onClick={() => navigate("/tag-whats")}
            className="mb-6"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>

          <header className="text-center mb-8">
            <div className="flex items-center justify-center gap-3 mb-2">
              <Cloud className="h-8 w-8 text-emerald-500" />
              <h1 className="text-3xl md:text-4xl font-bold">Tag Whats Cloud</h1>
            </div>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Detecta automaticamente comprovantes PIX em imagens e PDFs e marca a etiqueta "Pago" no WhatsApp Business
            </p>
          </header>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <Card className="border-emerald-500/20">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-emerald-500">{configs.filter(c => c.is_active).length}</p>
                <p className="text-sm text-muted-foreground">Números Ativos</p>
              </CardContent>
            </Card>
            <Card className="border-blue-500/20">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-blue-500">{connectedInstances.length}</p>
                <p className="text-sm text-muted-foreground">Números Conectados</p>
              </CardContent>
            </Card>
            <Card className="border-amber-500/20">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-amber-500">{totalLabelsApplied}</p>
                <p className="text-sm text-muted-foreground">Vendas Totais</p>
              </CardContent>
            </Card>
          </div>

          {/* Chart */}
          {instancesWithLogs.length > 0 && (
            <Card className="mb-6 border-emerald-500/20">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-emerald-500" />
                    <CardTitle className="text-lg">Etiquetas por Número</CardTitle>
                  </div>
                  <Select value={chartPeriod} onValueChange={(v: '7' | '30') => setChartPeriod(v)}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="Período" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">Últimos 7 dias</SelectItem>
                      <SelectItem value="30">Últimos 30 dias</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        {instancesWithLogs.map((instanceId, index) => (
                          <linearGradient key={instanceId} id={`gradient-${instanceId}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={CHART_COLORS[index % CHART_COLORS.length]} stopOpacity={0.3} />
                            <stop offset="95%" stopColor={CHART_COLORS[index % CHART_COLORS.length]} stopOpacity={0} />
                          </linearGradient>
                        ))}
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="date" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                      <YAxis allowDecimals={false} className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px'
                        }}
                        labelStyle={{ color: 'hsl(var(--foreground))' }}
                        formatter={(value: number, name: string) => [value, getInstanceName(name)]}
                      />
                      <Legend formatter={(value) => getInstanceName(value)} />
                      {instancesWithLogs.map((instanceId, index) => (
                        <Area
                          key={instanceId}
                          type="monotone"
                          dataKey={instanceId}
                          name={instanceId}
                          stroke={CHART_COLORS[index % CHART_COLORS.length]}
                          fill={`url(#gradient-${instanceId})`}
                          strokeWidth={2}
                        />
                      ))}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Important Note */}
          <Card className="mb-6 border-amber-500/30 bg-amber-500/5">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-amber-500/20 rounded-full">
                  <FileText className="h-4 w-4 text-amber-500" />
                </div>
                <div>
                  <h4 className="font-semibold text-amber-400">Importante</h4>
                  <p className="text-sm text-muted-foreground">
                    Certifique-se de ter a etiqueta <strong>"Pago"</strong> criada no seu WhatsApp Business. 
                    O sistema irá automaticamente detectar comprovantes PIX e aplicar essa etiqueta.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Add Number */}
          <Card className="mb-6 border-dashed border-2 border-emerald-500/30 bg-emerald-500/5">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">Adicionar Número</h3>
                  <p className="text-sm text-muted-foreground">
                    {availableInstances.length > 0 
                      ? `${availableInstances.length} número(s) disponível(is) para configurar`
                      : 'Adicione um novo número de WhatsApp'
                    }
                  </p>
                </div>
                <div className="flex gap-2 items-center">
                  {availableInstances.map(instance => (
                    <Button
                      key={instance.id}
                      variant="outline"
                      size="sm"
                      className="border-emerald-500/50 text-emerald-500 hover:bg-emerald-500/10"
                      onClick={() => handleOpenConfig(instance)}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      {instance.phone_number || instance.instance_name}
                    </Button>
                  ))}
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => navigate('/tag-whats/cloud/add-number')}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>


          {instances.length === 0 && !loading && (
            <Card className="mb-6 border-yellow-500/30 bg-yellow-500/5">
              <CardContent className="p-6 text-center">
                <QrCode className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
                <h3 className="font-semibold text-lg mb-2">Nenhum número conectado</h3>
                <p className="text-muted-foreground mb-4">
                  Você precisa conectar um número no Maturador primeiro para usar o Tag Whats em nuvem.
                </p>
                <Button onClick={() => navigate("/maturador/instances")} className="bg-yellow-600 hover:bg-yellow-700">
                  Conectar Número
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Configured Numbers */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Números Configurados</h2>
              <Button variant="ghost" size="sm" onClick={fetchData} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Atualizar
              </Button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : configs.length === 0 ? (
              <Card className="border-muted">
                <CardContent className="p-8 text-center">
                  <Settings className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="font-semibold text-lg mb-2">Nenhuma configuração</h3>
                  <p className="text-muted-foreground">
                    Configure um número para começar a detectar comprovantes automaticamente.
                  </p>
                </CardContent>
              </Card>
            ) : (
              configs.map(config => {
                const instance = instances.find(i => i.id === config.instance_id);
                if (!instance) return null;

                return (
                  <Card key={config.id} className={`border-2 ${config.is_active ? 'border-emerald-500/30' : 'border-muted'}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${config.is_active ? 'bg-emerald-500/20' : 'bg-muted'}`}>
                            {config.is_active ? (
                              <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                            ) : (
                              <XCircle className="h-6 w-6 text-muted-foreground" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold">
                                {instance.phone_number || instance.instance_name}
                              </h3>
                              <Badge 
                                variant={instance.status === 'connected' ? 'default' : 'secondary'} 
                                className={`text-xs ${instance.status === 'connected' ? 'bg-green-500 hover:bg-green-600 text-white' : ''}`}
                              >
                                {instance.status === 'connected' ? 'Conectado' : 'Desconectado'}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                              <span className="flex items-center gap-1">
                                <Image className="h-3 w-3" />
                                Imagens: {config.filter_images ? 'Sim' : 'Não'}
                              </span>
                              <span className="flex items-center gap-1">
                                <FileText className="h-3 w-3" />
                                PDFs: {config.filter_pdfs ? 'Sim' : 'Não'}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <ColoredSwitch
                            checked={config.is_active}
                            onCheckedChange={(checked) => handleToggleActive(config.id, checked)}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenConfig(instance)}
                          >
                            <Settings className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => {
                              setConfigToDelete(config.id);
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>

          <footer className="mt-16 text-center text-xs text-muted-foreground/50">
            Criado por <a href="https://instagram.com/joaolucassps" target="_blank" rel="noopener noreferrer" className="hover:text-muted-foreground transition-colors">@joaolucassps</a>
          </footer>
        </div>
      </div>

      {/* Config Modal */}
      <Dialog open={configModalOpen} onOpenChange={setConfigModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configurar Tag Whats</DialogTitle>
            <DialogDescription>
              Configure como o Tag Whats deve monitorar este número: {selectedInstance?.phone_number || selectedInstance?.instance_name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            <div className="space-y-4">
              <h4 className="font-medium">Filtrar por tipo de mídia:</h4>
              
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Image className="h-5 w-5 text-blue-500" />
                  <div>
                    <Label>Imagens</Label>
                    <p className="text-xs text-muted-foreground">Detectar comprovantes em imagens</p>
                  </div>
                </div>
                <ColoredSwitch checked={filterImages} onCheckedChange={setFilterImages} />
              </div>

              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-red-500" />
                  <div>
                    <Label>PDFs</Label>
                    <p className="text-xs text-muted-foreground">Detectar comprovantes em PDFs</p>
                  </div>
                </div>
                <ColoredSwitch checked={filterPdfs} onCheckedChange={setFilterPdfs} />
              </div>
            </div>

            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4">
              <h4 className="font-medium text-emerald-400 mb-2">Como funciona:</h4>
              <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                <li>O sistema monitora mensagens recebidas</li>
                <li>IA analisa imagens e PDFs automaticamente</li>
                <li>Se for um comprovante PIX, marca como "Pago"</li>
                <li>A etiqueta aparece no WhatsApp Business</li>
              </ol>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigModalOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSaveConfig} 
              disabled={saving || (!filterImages && !filterPdfs)}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Salvar Configuração
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover Configuração</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover esta configuração? O sistema deixará de monitorar comprovantes neste número.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfig} className="bg-destructive hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default TagWhatsCloud;
