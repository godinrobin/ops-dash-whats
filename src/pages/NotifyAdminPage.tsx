import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { 
  ArrowLeft, Bell, Phone, Plus, RefreshCw, Loader2, Trash2, 
  Users, BarChart3, Wifi, WifiOff, Settings, Save, AlertTriangle,
  Smartphone, ShoppingBag, Info, X, Pencil, Lock
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffectiveUser } from "@/hooks/useEffectiveUser";
import { useActivityTracker } from "@/hooks/useActivityTracker";
import { toast } from "sonner";
import { formatPhoneDisplay } from "@/utils/phoneFormatter";
import { cn } from "@/lib/utils";
import automatizapIcon from "@/assets/automatizap-icon.png";

interface Instance {
  id: string;
  instance_name: string;
  phone_number: string | null;
  label: string | null;
  status: string;
}

interface NotifyConfig {
  id: string;
  notifier_instance_id: string | null;
  admin_instance_ids: string[];
}

interface LeadLimit {
  id: string;
  instance_id: string;
  daily_limit: number;
  is_active: boolean;
}

interface InstanceMonitor {
  id: string;
  instance_id: string;
  is_active: boolean;
}

interface SalesMonitor {
  id: string;
  instance_id: string;
  is_active: boolean;
}

export default function NotifyAdminPage() {
  useActivityTracker("page_visit", "Notificar Admin");
  const navigate = useNavigate();
  const { user } = useAuth();
  const { effectiveUserId } = useEffectiveUser();

  const [instances, setInstances] = useState<Instance[]>([]);
  const [config, setConfig] = useState<NotifyConfig | null>(null);
  const [leadLimits, setLeadLimits] = useState<LeadLimit[]>([]);
  const [instanceMonitors, setInstanceMonitors] = useState<InstanceMonitor[]>([]);
  const [salesMonitors, setSalesMonitors] = useState<SalesMonitor[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Form state
  const [notifierInstanceId, setNotifierInstanceId] = useState<string>("");
  const [adminInstanceIds, setAdminInstanceIds] = useState<string[]>([]);

  // Lead limit modal
  const [leadLimitModalOpen, setLeadLimitModalOpen] = useState(false);
  const [editingLeadLimit, setEditingLeadLimit] = useState<LeadLimit | null>(null);
  const [selectedInstanceForLimit, setSelectedInstanceForLimit] = useState<string>("");
  const [newDailyLimit, setNewDailyLimit] = useState(30);

  const fetchData = useCallback(async () => {
    const userId = effectiveUserId || user?.id;
    if (!userId) return;

    try {
      // Fetch instances
      const { data: instancesData } = await supabase
        .from('maturador_instances')
        .select('id, instance_name, phone_number, label, status')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      setInstances(instancesData || []);

      // Fetch config
      const { data: configData } = await supabase
        .from('admin_notify_configs')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (configData) {
        setConfig(configData);
        setNotifierInstanceId(configData.notifier_instance_id || "");
        setAdminInstanceIds(configData.admin_instance_ids || []);

        // Fetch lead limits
        const { data: limitsData } = await supabase
          .from('admin_notify_lead_limits')
          .select('*')
          .eq('config_id', configData.id);
        setLeadLimits(limitsData || []);

        // Fetch instance monitors
        const { data: monitorsData } = await supabase
          .from('admin_notify_instance_monitor')
          .select('*')
          .eq('config_id', configData.id);
        setInstanceMonitors(monitorsData || []);

        // Fetch sales monitors
        const { data: salesData } = await supabase
          .from('admin_notify_sales_monitor')
          .select('*')
          .eq('config_id', configData.id);
        setSalesMonitors(salesData || []);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, effectiveUserId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSaveConfig = async () => {
    const userId = effectiveUserId || user?.id;
    if (!userId) return;

    if (!notifierInstanceId) {
      toast.error('Selecione um número notificador');
      return;
    }

    if (adminInstanceIds.length === 0) {
      toast.error('Selecione pelo menos um número admin');
      return;
    }

    setSaving(true);
    try {
      if (config) {
        // Update existing config
        const { error } = await supabase
          .from('admin_notify_configs')
          .update({
            notifier_instance_id: notifierInstanceId,
            admin_instance_ids: adminInstanceIds,
          })
          .eq('id', config.id);

        if (error) throw error;
      } else {
        // Create new config
        const { data, error } = await supabase
          .from('admin_notify_configs')
          .insert({
            user_id: userId,
            notifier_instance_id: notifierInstanceId,
            admin_instance_ids: adminInstanceIds,
          })
          .select()
          .single();

        if (error) throw error;
        setConfig(data);
      }

      toast.success('Configuração salva com sucesso!');
      fetchData();
    } catch (error: any) {
      console.error('Error saving config:', error);
      toast.error(error.message || 'Erro ao salvar configuração');
    } finally {
      setSaving(false);
    }
  };

  const handleAddLeadLimit = async () => {
    if (!config) {
      toast.error('Salve a configuração principal primeiro');
      return;
    }

    if (!selectedInstanceForLimit) {
      toast.error('Selecione uma instância');
      return;
    }

    const userId = effectiveUserId || user?.id;
    if (!userId) return;

    // Check if limit already exists for this instance
    const existingLimit = leadLimits.find(l => l.instance_id === selectedInstanceForLimit);
    
    setSaving(true);
    try {
      if (existingLimit) {
        // Update existing limit
        const { error } = await supabase
          .from('admin_notify_lead_limits')
          .update({ daily_limit: newDailyLimit, is_active: true })
          .eq('id', existingLimit.id);

        if (error) throw error;
        toast.success('Limite de leads atualizado!');
      } else {
        // Insert new limit
        const { error } = await supabase
          .from('admin_notify_lead_limits')
          .insert({
            user_id: userId,
            config_id: config.id,
            instance_id: selectedInstanceForLimit,
            daily_limit: newDailyLimit,
            is_active: true,
          });

        if (error) throw error;
        toast.success('Limite de leads adicionado!');
      }

      setLeadLimitModalOpen(false);
      setSelectedInstanceForLimit("");
      setNewDailyLimit(30);
      setEditingLeadLimit(null);
      fetchData();
    } catch (error: any) {
      console.error('Error adding/updating lead limit:', error);
      toast.error(error.message || 'Erro ao adicionar limite');
    } finally {
      setSaving(false);
    }
  };

  const handleEditLeadLimit = (limit: LeadLimit) => {
    setEditingLeadLimit(limit);
    setSelectedInstanceForLimit(limit.instance_id);
    setNewDailyLimit(limit.daily_limit);
    setLeadLimitModalOpen(true);
  };

  const handleToggleLeadLimit = async (id: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from('admin_notify_lead_limits')
        .update({ is_active: !isActive })
        .eq('id', id);

      if (error) throw error;
      fetchData();
    } catch (error) {
      console.error('Error toggling lead limit:', error);
      toast.error('Erro ao atualizar limite');
    }
  };

  const handleDeleteLeadLimit = async (id: string) => {
    try {
      const { error } = await supabase
        .from('admin_notify_lead_limits')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Limite removido');
      fetchData();
    } catch (error) {
      console.error('Error deleting lead limit:', error);
      toast.error('Erro ao remover limite');
    }
  };

  const handleToggleInstanceMonitor = async (instanceId: string) => {
    if (!config) {
      toast.error('Salve a configuração principal primeiro');
      return;
    }

    const userId = effectiveUserId || user?.id;
    if (!userId) return;

    const existing = instanceMonitors.find(m => m.instance_id === instanceId);

    try {
      if (existing) {
        const { error } = await supabase
          .from('admin_notify_instance_monitor')
          .update({ is_active: !existing.is_active })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('admin_notify_instance_monitor')
          .insert({
            user_id: userId,
            config_id: config.id,
            instance_id: instanceId,
            is_active: true,
          });
        if (error) throw error;
      }
      fetchData();
    } catch (error) {
      console.error('Error toggling instance monitor:', error);
      toast.error('Erro ao atualizar monitoramento');
    }
  };

  const handleToggleSalesMonitor = async (instanceId: string) => {
    if (!config) {
      toast.error('Salve a configuração principal primeiro');
      return;
    }

    const userId = effectiveUserId || user?.id;
    if (!userId) return;

    const existing = salesMonitors.find(m => m.instance_id === instanceId);

    try {
      if (existing) {
        const { error } = await supabase
          .from('admin_notify_sales_monitor')
          .update({ is_active: !existing.is_active })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('admin_notify_sales_monitor')
          .insert({
            user_id: userId,
            config_id: config.id,
            instance_id: instanceId,
            is_active: true,
          });
        if (error) throw error;
      }
      fetchData();
    } catch (error) {
      console.error('Error toggling sales monitor:', error);
      toast.error('Erro ao atualizar monitoramento');
    }
  };

  const getInstanceDisplay = (instanceId: string) => {
    const instance = instances.find(i => i.id === instanceId);
    if (!instance) return "Número desconhecido";
    return instance.phone_number 
      ? formatPhoneDisplay(instance.phone_number)
      : instance.label || instance.instance_name;
  };

  const handleAddAdminInstance = (instanceId: string) => {
    if (instanceId && !adminInstanceIds.includes(instanceId)) {
      setAdminInstanceIds([...adminInstanceIds, instanceId]);
    }
  };

  const handleRemoveAdminInstance = (instanceId: string) => {
    setAdminInstanceIds(adminInstanceIds.filter(id => id !== instanceId));
  };

  const connectedInstances = instances.filter(i => i.status === 'connected');
  const availableForLimits = connectedInstances;
  const availableAdminInstances = connectedInstances.filter(i => !adminInstanceIds.includes(i.id));

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">Carregando configurações...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="h-14 md:h-16" />
      
      <div className="container mx-auto px-4 py-8 max-w-6xl relative">
        {/* Full page blur overlay - Coming Soon */}
        <div className="absolute inset-0 bg-background/60 backdrop-blur-md z-50 flex flex-col items-center justify-center rounded-lg">
          <div className="text-center space-y-4">
            <div className="p-4 rounded-full bg-muted inline-block">
              <Lock className="h-12 w-12 text-muted-foreground" />
            </div>
            <h2 className="text-2xl font-bold text-foreground">Em Breve</h2>
            <p className="text-muted-foreground max-w-md">
              A função de Notificar Admin está em desenvolvimento e será liberada em breve.
            </p>
            <Button variant="outline" onClick={() => navigate('/inbox')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar para Inbox
            </Button>
          </div>
        </div>
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/inbox')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gradient-to-r from-amber-400 to-orange-500">
                <Bell className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Notificar Admin</h1>
                <p className="text-muted-foreground">Configure alertas e notificações</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => { setRefreshing(true); fetchData(); }} disabled={refreshing}>
              <RefreshCw className={cn("h-4 w-4 mr-2", refreshing && "animate-spin")} />
              Atualizar
            </Button>
            <Button onClick={() => navigate('/inbox/notify-admin/add-number')}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Número
            </Button>
          </div>
        </div>

        {/* Configuration Section */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Configuração Principal
            </CardTitle>
            <CardDescription>
              Configure o número que envia as notificações e os números que recebem os alertas
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Notifier Selection */}
              <div className="space-y-3">
                <Label className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  Número Notificador
                </Label>
                <p className="text-sm text-muted-foreground">
                  Este número irá enviar as mensagens de alerta
                </p>
                <Select value={notifierInstanceId} onValueChange={setNotifierInstanceId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um número" />
                  </SelectTrigger>
                  <SelectContent>
                    {connectedInstances.map((instance) => (
                      <SelectItem key={instance.id} value={instance.id}>
                        {instance.phone_number 
                          ? formatPhoneDisplay(instance.phone_number)
                          : instance.label || instance.instance_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Admin Selection with Dropdown and Chips */}
              <div className="space-y-3">
                <Label className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Números Admin
                </Label>
                <p className="text-sm text-muted-foreground">
                  Estes números receberão os alertas
                </p>
                <Select 
                  value="" 
                  onValueChange={handleAddAdminInstance}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um número para adicionar" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableAdminInstances.length === 0 ? (
                      <div className="p-2 text-sm text-muted-foreground text-center">
                        Todos os números já foram adicionados
                      </div>
                    ) : (
                      availableAdminInstances.map((instance) => (
                        <SelectItem key={instance.id} value={instance.id}>
                          {instance.phone_number 
                            ? formatPhoneDisplay(instance.phone_number)
                            : instance.label || instance.instance_name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                
                {/* Selected Admin Chips */}
                {adminInstanceIds.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {adminInstanceIds.map((instanceId) => (
                      <Badge 
                        key={instanceId}
                        variant="secondary"
                        className="flex items-center gap-1 py-1 px-2"
                      >
                        <Smartphone className="h-3 w-3" />
                        {getInstanceDisplay(instanceId)}
                        <button
                          onClick={() => handleRemoveAdminInstance(instanceId)}
                          className="ml-1 hover:text-destructive transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <Button onClick={handleSaveConfig} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Salvar Configuração
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Alert Types */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Lead Limit Alert */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <BarChart3 className="h-5 w-5 text-blue-500" />
                Limite de Leads
              </CardTitle>
              <CardDescription>
                Receba alerta quando um número atingir o limite diário de conversas
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted/50 p-3 rounded-lg flex items-start gap-2">
                <Info className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-muted-foreground">
                  A contagem é resetada diariamente às 00:00 (horário de Brasília -03:00)
                </p>
              </div>

              {leadLimits.length > 0 ? (
                <div className="space-y-3">
                  {leadLimits.map((limit) => (
                    <div 
                      key={limit.id}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-lg border",
                        limit.is_active ? "bg-card" : "bg-muted/30 opacity-60"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <Switch
                          checked={limit.is_active}
                          onCheckedChange={() => handleToggleLeadLimit(limit.id, limit.is_active)}
                          className="data-[state=checked]:bg-green-500 data-[state=unchecked]:bg-red-500"
                        />
                        <div>
                          <p className="text-sm font-medium">{getInstanceDisplay(limit.instance_id)}</p>
                          <p className="text-xs text-muted-foreground">
                            Limite: {limit.daily_limit} conversas/dia
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={() => handleEditLeadLimit(limit)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => handleDeleteLeadLimit(limit.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhum limite configurado
                </p>
              )}

              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => {
                  setEditingLeadLimit(null);
                  setSelectedInstanceForLimit("");
                  setNewDailyLimit(30);
                  setLeadLimitModalOpen(true);
                }}
                disabled={!config || availableForLimits.length === 0}
              >
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Número
              </Button>
            </CardContent>
          </Card>

          {/* Instance Disconnect Alert - Blurred */}
          <Card className="relative overflow-hidden">
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center">
              <Lock className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm font-medium text-muted-foreground">Em breve</p>
            </div>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <WifiOff className="h-5 w-5 text-red-500" />
                Instância Desconectada
              </CardTitle>
              <CardDescription>
                Envie <Badge variant="outline" className="text-xs">#status</Badge> para verificar as instâncias
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted/50 p-3 rounded-lg flex items-start gap-2">
                <Info className="h-4 w-4 text-orange-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-muted-foreground">
                  Ao enviar #status, você receberá o status de cada número monitorado
                </p>
              </div>

              {connectedInstances.length > 0 ? (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {connectedInstances.map((instance) => {
                    const monitor = instanceMonitors.find(m => m.instance_id === instance.id);
                    const isMonitored = monitor?.is_active ?? false;
                    
                    return (
                      <div 
                        key={instance.id}
                        className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50"
                      >
                        <div className="flex items-center gap-2">
                          <Wifi className="h-4 w-4 text-green-500" />
                          <span className="text-sm">{getInstanceDisplay(instance.id)}</span>
                        </div>
                        <Switch
                          checked={isMonitored}
                          onCheckedChange={() => handleToggleInstanceMonitor(instance.id)}
                          disabled={!config}
                          className="data-[state=checked]:bg-green-500 data-[state=unchecked]:bg-red-500"
                        />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhum número conectado
                </p>
              )}
            </CardContent>
          </Card>

          {/* Sales Monitor Alert - Blurred */}
          <Card className="relative overflow-hidden">
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center">
              <Lock className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm font-medium text-muted-foreground">Em breve</p>
            </div>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShoppingBag className="h-5 w-5 text-green-500" />
                Monitor de Vendas
              </CardTitle>
              <CardDescription>
                Envie <Badge variant="outline" className="text-xs">#vendas</Badge> para ver vendas do dia
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted/50 p-3 rounded-lg flex items-start gap-2">
                <Info className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-muted-foreground">
                  Dados provenientes do Tag Whats Cloud
                </p>
              </div>

              {connectedInstances.length > 0 ? (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {connectedInstances.map((instance) => {
                    const monitor = salesMonitors.find(m => m.instance_id === instance.id);
                    const isMonitored = monitor?.is_active ?? false;
                    
                    return (
                      <div 
                        key={instance.id}
                        className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50"
                      >
                        <div className="flex items-center gap-2">
                          <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">{getInstanceDisplay(instance.id)}</span>
                        </div>
                        <Switch
                          checked={isMonitored}
                          onCheckedChange={() => handleToggleSalesMonitor(instance.id)}
                          disabled={!config}
                          className="data-[state=checked]:bg-green-500 data-[state=unchecked]:bg-red-500"
                        />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhum número conectado
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Lead Limit Modal */}
      <Dialog open={leadLimitModalOpen} onOpenChange={setLeadLimitModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingLeadLimit ? 'Editar Limite de Leads' : 'Adicionar Limite de Leads'}
            </DialogTitle>
            <DialogDescription>
              Configure o limite diário de conversas para um número
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Número para Monitorar</Label>
              <Select 
                value={selectedInstanceForLimit} 
                onValueChange={setSelectedInstanceForLimit}
                disabled={!!editingLeadLimit}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um número" />
                </SelectTrigger>
                <SelectContent>
                  {availableForLimits.map((instance) => (
                    <SelectItem key={instance.id} value={instance.id}>
                      {instance.phone_number 
                        ? formatPhoneDisplay(instance.phone_number)
                        : instance.label || instance.instance_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Limite Diário de Conversas</Label>
              <Input
                type="number"
                min={1}
                value={newDailyLimit}
                onChange={(e) => setNewDailyLimit(parseInt(e.target.value) || 30)}
              />
              <p className="text-xs text-muted-foreground">
                Você será notificado quando este número atingir {newDailyLimit} conversas no dia
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setLeadLimitModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAddLeadLimit} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : editingLeadLimit ? <Save className="h-4 w-4 mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              {editingLeadLimit ? 'Salvar' : 'Adicionar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
