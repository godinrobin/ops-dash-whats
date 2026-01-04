import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ArrowLeft, MessageSquare, Smartphone, GitBranch, Tag, Plus, RefreshCw, Loader2, QrCode, Trash2, PowerOff, RotateCcw, ChevronDown, ChevronRight, Phone, Zap, Users, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffectiveUser } from "@/hooks/useEffectiveUser";
import { toast } from "sonner";
import automatizapIcon from "@/assets/automatizap-icon.png";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { InboxMenu } from '@/components/inbox/InboxMenu';
import { cn } from '@/lib/utils';
import { useActivityTracker } from '@/hooks/useActivityTracker';
import { QRCodeModal, getQrCodeFromCache, setQrCodeCache } from "@/components/QRCodeModal";

interface Instance {
  id: string;
  instance_name: string;
  phone_number: string | null;
  label: string | null;
  status: string;
  qrcode: string | null;
  last_seen: string | null;
  created_at: string;
}

interface Flow {
  id: string;
  name: string;
  is_active: boolean;
  assigned_instances: string[] | null;
}

interface InboxTag {
  id: string;
  name: string;
  color: string;
}

export default function InboxDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { effectiveUserId } = useEffectiveUser();
  
  // Track activity for Automati-Zap main page
  useActivityTracker('page_visit', 'Automati-Zap');
  const [instances, setInstances] = useState<Instance[]>([]);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [tags, setTags] = useState<InboxTag[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedInstances, setExpandedInstances] = useState<Set<string>>(new Set());
  const [tagsMenuOpen, setTagsMenuOpen] = useState(false);

  // Create instance modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newInstanceName, setNewInstanceName] = useState("");
  const [creating, setCreating] = useState(false);
  
  // Proxy configuration (optional)
  const [proxyEnabled, setProxyEnabled] = useState(false);
  const [proxyHost, setProxyHost] = useState("");
  const [proxyPort, setProxyPort] = useState("");
  const [proxyProtocol, setProxyProtocol] = useState("http");
  const [proxyUsername, setProxyUsername] = useState("");
  const [proxyPassword, setProxyPassword] = useState("");
  

  // QR Code modal
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [currentQrInstance, setCurrentQrInstance] = useState<Instance | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [loadingQr, setLoadingQr] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [instanceToDelete, setInstanceToDelete] = useState<Instance | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  // Fase 1: Carrega apenas dados essenciais (instâncias e fluxos)
  const fetchEssentialData = async () => {
    const userId = effectiveUserId || user?.id;
    if (!userId) return;

    try {
      const [instancesRes, flowsRes, tagsRes] = await Promise.all([
        supabase.from('maturador_instances').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
        supabase.from('inbox_flows').select('id, name, is_active, assigned_instances').eq('user_id', userId),
        supabase.from('inbox_tags').select('*').eq('user_id', userId),
      ]);

      if (instancesRes.data) setInstances(instancesRes.data);
      if (flowsRes.data) setFlows(flowsRes.data);
      if (tagsRes.data) setTags(tagsRes.data);
    } catch (error) {
      console.error('Error fetching essential data:', error);
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  // Fase 2: Carrega dados secundários em background (contatos e mensagens)
  const fetchSecondaryData = async () => {
    if (!user) return;

    try {
      // Pega mensagens dos últimos 7 dias SEM limite para contagem correta
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const [contactsRes, messagesRes] = await Promise.all([
        supabase.from('inbox_contacts').select('id, instance_id, created_at').eq('user_id', user.id),
        supabase.from('inbox_messages').select('id, instance_id, contact_id, created_at, direction').eq('user_id', user.id).gte('created_at', sevenDaysAgo.toISOString()).order('created_at', { ascending: false }),
      ]);

      if (contactsRes.data) setContacts(contactsRes.data);
      if (messagesRes.data) setMessages(messagesRes.data);
    } catch (error) {
      console.error('Error fetching secondary data:', error);
    }
  };

  const fetchData = async () => {
    await fetchEssentialData();
  };

  // Verify and configure webhooks for connected instances in the background
  const verifyWebhooks = async () => {
    try {
      console.log('[VERIFY-WEBHOOKS] Starting background webhook verification');
      const { data, error } = await supabase.functions.invoke('verify-webhooks', {});
      if (error) {
        console.error('[VERIFY-WEBHOOKS] Error:', error);
      } else {
        console.log('[VERIFY-WEBHOOKS] Result:', data);
      }
    } catch (error) {
      console.error('[VERIFY-WEBHOOKS] Error:', error);
    }
  };

  // Auto-heal webhooks silently - force reconfigure to ensure they are active
  const autoHealWebhooks = async () => {
    try {
      console.log('[AUTO-HEAL] Starting silent webhook reconfiguration');
      const { data, error } = await supabase.functions.invoke('force-reconfigure-webhooks', {});
      if (error) {
        console.error('[AUTO-HEAL] Error:', error);
      } else {
        console.log('[AUTO-HEAL] Result:', data);
      }
    } catch (error) {
      console.error('[AUTO-HEAL] Error:', error);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  // Carrega dados secundários após o essencial
  useEffect(() => {
    if (!loading && user) {
      fetchSecondaryData();
    }
  }, [loading, user]);

  // Enable ignoreGroups on all connected instances (silently in background)
  const enableIgnoreGroupsOnAllInstances = async () => {
    const connectedInstances = instances.filter(i => i.status === 'connected');
    if (connectedInstances.length === 0) return;

    try {
      console.log('[IGNORE-GROUPS] Enabling ignoreGroups for all connected instances');
      const instanceNames = connectedInstances.map(i => i.instance_name);
      
      const { data, error } = await supabase.functions.invoke('maturador-evolution', {
        body: { action: 'enable-ignore-groups', instanceNames },
      });
      
      if (error) {
        console.error('[IGNORE-GROUPS] Error:', error);
        return;
      }
      
      console.log('[IGNORE-GROUPS] Result:', data);
    } catch (error) {
      console.error('[IGNORE-GROUPS] Error:', error);
    }
  };

  // Verify webhooks after data is loaded (em background, não bloqueia UI)
  useEffect(() => {
    if (instances.length > 0 && !loading) {
      // Auto-heal webhooks first (force reconfigure)
      setTimeout(() => autoHealWebhooks(), 1000);
      // Then verify webhooks
      setTimeout(() => verifyWebhooks(), 3000);
      // Enable ignoreGroups on all connected instances (após webhooks)
      setTimeout(() => enableIgnoreGroupsOnAllInstances(), 5000);
    }
  }, [instances, loading]);

  const handleRefresh = async () => {
    setRefreshing(true);
    for (const instance of instances) {
      try {
        await supabase.functions.invoke('maturador-evolution', {
          body: { action: 'check-status', instanceName: instance.instance_name },
        });
      } catch (error) {
        console.error(`Error checking status for ${instance.instance_name}:`, error);
      }
    }
    await fetchData();
    setRefreshing(false);
    toast.success('Status atualizado');
  };

  const handleSyncPhoneNumbers = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('maturador-evolution', {
        body: { action: 'sync-phone-numbers' },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      const syncedCount = data.results?.filter((r: any) => r.phoneNumber).length || 0;
      toast.success(`${syncedCount} número(s) sincronizado(s)!`);
      await fetchData();
    } catch (error: any) {
      console.error('Error syncing phone numbers:', error);
      toast.error(error.message || 'Erro ao sincronizar números');
    } finally {
      setSyncing(false);
    }
  };

  const handleCreateInstance = async () => {
    if (!newInstanceName.trim()) {
      toast.error('Nome do número é obrigatório');
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(newInstanceName)) {
      toast.error('O nome deve conter apenas letras, números e underscores');
      return;
    }

    setCreating(true);
    try {
      const body: any = { action: 'create-instance', instanceName: newInstanceName };
      
      // Add proxy configuration if enabled
      if (proxyEnabled && proxyHost && proxyPort) {
        body.proxy = {
          host: proxyHost,
          port: proxyPort,
          protocol: proxyProtocol,
          username: proxyUsername || undefined,
          password: proxyPassword || undefined,
        };
      }
      

      const { data, error } = await supabase.functions.invoke('maturador-evolution', { body });
      if (error) throw error;
      if (data.error) throw new Error(data.error);

      toast.success('Número criado com sucesso!');
      setCreateModalOpen(false);
      resetCreateForm();
      await fetchData();

      const newInstance = {
        ...data,
        instance_name: newInstanceName,
        qrcode: data.qrcode?.base64,
      };

      if (newInstance.qrcode) {
        setCurrentQrInstance(newInstance);
        setQrCode(newInstance.qrcode);
        setQrModalOpen(true);
      }
    } catch (error: any) {
      console.error('Error creating instance:', error);
      toast.error(error.message || 'Erro ao criar número');
    } finally {
      setCreating(false);
    }
  };

  const resetCreateForm = () => {
    setNewInstanceName("");
    setProxyEnabled(false);
    setProxyHost("");
    setProxyPort("");
    setProxyProtocol("http");
    setProxyUsername("");
    setProxyPassword("");
  };

  const handleGetQrCode = useCallback(async (instance: Instance) => {
    setCurrentQrInstance(instance);
    setQrModalOpen(true);
    
    // Check cache first
    const cachedQr = getQrCodeFromCache(instance.instance_name);
    if (cachedQr) {
      setQrCode(cachedQr);
      setLoadingQr(false);
      return;
    }
    
    setLoadingQr(true);
    setQrCode(null);

    try {
      const { data, error } = await supabase.functions.invoke('maturador-evolution', {
        body: { action: 'get-qrcode', instanceName: instance.instance_name },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      // Check if already connected
      if (data.connected) {
        toast.success('WhatsApp já está conectado!');
        setQrModalOpen(false);
        await fetchData();
        return;
      }
      
      // UazAPI returns QR as data URI inside base64 or as instance.qrcode
      const qr = data.base64 || data.qrcode?.base64 || data.qrcode;
      if (qr) {
        setQrCodeCache(instance.instance_name, qr);
        setQrCode(qr);
      }
    } catch (error: any) {
      console.error('Error getting QR code:', error);
      toast.error(error.message || 'Erro ao obter QR Code');
      setQrModalOpen(false);
    } finally {
      setLoadingQr(false);
    }
  }, []);

  const handleRefreshQrCode = useCallback(async () => {
    if (!currentQrInstance) return;
    setLoadingQr(true);
    setQrCode(null);
    
    try {
      const { data, error } = await supabase.functions.invoke('maturador-evolution', {
        body: { action: 'get-qrcode', instanceName: currentQrInstance.instance_name, forceNew: true },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      // Check if already connected
      if (data.connected) {
        toast.success('WhatsApp já está conectado!');
        setQrModalOpen(false);
        await fetchData();
        return;
      }
      
      // UazAPI returns QR as data URI inside base64 or as instance.qrcode
      const qr = data.base64 || data.qrcode?.base64 || data.qrcode;
      if (qr) {
        setQrCodeCache(currentQrInstance.instance_name, qr);
        setQrCode(qr);
      } else {
        toast.error('QR Code não disponível');
      }
    } catch (error: any) {
      console.error('Error refreshing QR code:', error);
      toast.error(error.message || 'Erro ao atualizar QR Code');
    } finally {
      setLoadingQr(false);
    }
  }, [currentQrInstance]);

  const handleCheckQrStatus = async () => {
    if (!currentQrInstance) return;
    setCheckingStatus(true);
    try {
      const { data, error } = await supabase.functions.invoke('maturador-evolution', {
        body: { action: 'check-status', instanceName: currentQrInstance.instance_name },
      });
      if (error) throw error;
      
      // Check if status is "connecting" FIRST - takes priority
      const rawInstanceStatus = data?.instance?.status;
      const isConnecting = 
        rawInstanceStatus === 'connecting' ||
        data?.status === 'connecting';

      // Check for connection status
      const isConnected = !isConnecting && (
        data.instance?.state === 'open' ||
        data.status?.connected === true ||
        rawInstanceStatus === 'connected' ||
        data.connected === true
      );
      
      if (isConnected) {
        toast.success('WhatsApp conectado com sucesso!');
        setQrModalOpen(false);
        await fetchData();
      } else if (isConnecting) {
        toast.info('Conectando... aguarde a sincronização');
        await fetchData();
      } else {
        toast.info('Aguardando leitura do QR Code...');
      }
    } catch (error: any) {
      console.error('Error checking status:', error);
    } finally {
      setCheckingStatus(false);
    }
  };

  const handleLogout = async (instance: Instance) => {
    setActionLoading(instance.id);
    try {
      const { data, error } = await supabase.functions.invoke('maturador-evolution', {
        body: { action: 'logout-instance', instanceName: instance.instance_name },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      toast.success('Número desconectado');
      await fetchData();
    } catch (error: any) {
      console.error('Error logging out:', error);
      toast.error(error.message || 'Erro ao desconectar');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRestart = async (instance: Instance) => {
    setActionLoading(instance.id);
    try {
      const { data, error } = await supabase.functions.invoke('maturador-evolution', {
        body: { action: 'restart-instance', instanceName: instance.instance_name },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      toast.success('Número reiniciado');
      await fetchData();
    } catch (error: any) {
      console.error('Error restarting:', error);
      toast.error(error.message || 'Erro ao reiniciar');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async () => {
    if (!instanceToDelete) return;
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke('maturador-evolution', {
        body: { action: 'delete-instance', instanceName: instanceToDelete.instance_name },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      toast.success('Número removido');
      setDeleteDialogOpen(false);
      setInstanceToDelete(null);
      await fetchData();
    } catch (error: any) {
      console.error('Error deleting:', error);
      toast.error(error.message || 'Erro ao remover número');
    } finally {
      setDeleting(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected': return 'bg-green-500';
      case 'connecting': return 'bg-yellow-500';
      default: return 'bg-red-500';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'connected': return 'Conectado';
      case 'connecting': return 'Conectando';
      default: return 'Desconectado';
    }
  };

  const getFlowsForInstance = (instanceId: string) => {
    return flows.filter(flow => 
      flow.assigned_instances?.includes(instanceId) || 
      (flow.assigned_instances?.length === 0 && flow.is_active)
    );
  };

  const toggleInstanceExpand = (instanceId: string) => {
    const newExpanded = new Set(expandedInstances);
    if (newExpanded.has(instanceId)) {
      newExpanded.delete(instanceId);
    } else {
      newExpanded.add(instanceId);
    }
    setExpandedInstances(newExpanded);
  };

  // Timezone helpers (São Paulo)
  const SAO_PAULO_TZ = 'America/Sao_Paulo';
  const DAY_MS = 24 * 60 * 60 * 1000;

  const formatSaoPauloYmd = (date: Date) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: SAO_PAULO_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);

  const getSaoPauloTodayUtcMidday = () => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: SAO_PAULO_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());

    const year = Number(parts.find((p) => p.type === 'year')?.value);
    const month = Number(parts.find((p) => p.type === 'month')?.value);
    const day = Number(parts.find((p) => p.type === 'day')?.value);

    return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  };

  const formatDdMm = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;

  // Stats calculations - São Paulo timezone
  const todayMessages = useMemo(() => {
    const todaySp = formatSaoPauloYmd(new Date());

    return messages.filter((m) => {
      const msgDaySp = formatSaoPauloYmd(new Date(m.created_at));
      return msgDaySp === todaySp;
    });
  }, [messages]);

  // Count unique conversations (contacts) today across all instances
  const todayConversationsCount = useMemo(() => {
    const todaySp = formatSaoPauloYmd(new Date());
    const uniqueContacts = new Set<string>();
    
    messages.forEach((m) => {
      const msgDaySp = formatSaoPauloYmd(new Date(m.created_at));
      if (msgDaySp === todaySp && m.contact_id) {
        uniqueContacts.add(m.contact_id);
      }
    });
    
    return uniqueContacts.size;
  }, [messages]);

  const CHART_COLORS = ['#f97316', '#3b82f6', '#22c55e', '#a855f7', '#ec4899', '#06b6d4', '#eab308', '#ef4444'];

  // Calculate conversations (contacts) by day for each instance (last 7 days) - São Paulo timezone
  const conversationsByDay = useMemo(() => {
    const todayUtcMidday = getSaoPauloTodayUtcMidday();

    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(todayUtcMidday.getTime() - (6 - i) * DAY_MS);
      return d.toISOString().slice(0, 10);
    });

    // Get all instance names first
    const allInstanceNames = instances.map(i => i.label || i.instance_name || i.phone_number || 'Desconhecido');

    // Initialize data structure with ALL instances and 0 values
    const dayMap = new Map<string, Record<string, Set<string>>>();
    last7Days.forEach((day) => {
      const dayData: Record<string, Set<string>> = {};
      allInstanceNames.forEach(name => {
        dayData[name] = new Set<string>();
      });
      dayMap.set(day, dayData);
    });

    // Count unique contacts (conversations) by day and instance
    messages.forEach((m) => {
      const day = formatSaoPauloYmd(new Date(m.created_at));

      if (dayMap.has(day) && m.instance_id && m.contact_id) {
        const instanceName =
          instances.find((i) => i.id === m.instance_id)?.label ||
          instances.find((i) => i.id === m.instance_id)?.instance_name ||
          instances.find((i) => i.id === m.instance_id)?.phone_number ||
          'Desconhecido';

        const dayData = dayMap.get(day)!;
        if (!dayData[instanceName]) {
          dayData[instanceName] = new Set<string>();
        }
        dayData[instanceName].add(m.contact_id);
      }
    });

    // Return data with ALL instances, showing 0 for empty days
    return last7Days.map((day) => {
      const dayData = dayMap.get(day)!;
      const result: Record<string, any> = {
        date: formatDdMm(day),
      };
      // Add all instance names with their count (0 if no data)
      allInstanceNames.forEach(name => {
        result[name] = dayData[name]?.size || 0;
      });
      return result;
    });
  }, [messages, instances]);

  // Get unique instance names for chart lines
  const instanceNames = useMemo(() => {
    return instances.map(i => i.label || i.instance_name || i.phone_number || 'Desconhecido');
  }, [instances]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="h-14 md:h-16" />
        <div className="container mx-auto px-4 py-8">
          {/* Skeleton para header */}
          <div className="flex items-center gap-4 mb-8">
            <div className="w-10 h-10 bg-muted rounded-full animate-pulse" />
            <div className="space-y-2">
              <div className="h-6 w-40 bg-muted rounded animate-pulse" />
              <div className="h-4 w-60 bg-muted rounded animate-pulse" />
            </div>
          </div>
          {/* Skeleton para cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 bg-muted rounded-lg animate-pulse" />
            ))}
          </div>
          {/* Skeleton para stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-muted rounded-lg animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const menuCards = [
    { 
      title: "Conversas", 
      description: "Gerencie todas as conversas em tempo real", 
      icon: MessageSquare, 
      path: "/inbox/chat",
      count: null,
      gradient: "from-green-400 to-emerald-500",
      comingSoon: false,
    },
    { 
      title: "Fluxos", 
      description: "Crie e gerencie fluxos de automação", 
      icon: GitBranch, 
      path: "/inbox/flows",
      count: flows.length,
      gradient: "from-blue-400 to-cyan-500",
      comingSoon: false,
    },
    { 
      title: "Etiquetas", 
      description: "Organize contatos com etiquetas", 
      icon: Tag, 
      path: null,
      count: tags.length,
      gradient: "from-purple-400 to-pink-500",
      comingSoon: true,
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="h-14 md:h-16" />
      
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-3">
              <img src={automatizapIcon} alt="Automati-Zap" className="w-10 h-10" />
              <div>
                <h1 className="text-2xl font-bold">Automati-Zap</h1>
                <p className="text-muted-foreground">Sistema para automatizar suas conversas</p>
              </div>
            </div>
          </div>
        </div>

        {/* Menu Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {menuCards.map((card) => (
            <Card 
              key={card.title}
              className={cn(
                "transition-all border-2 border-accent",
                card.comingSoon 
                  ? "opacity-60 cursor-not-allowed" 
                  : "cursor-pointer hover:shadow-lg hover:scale-105"
              )}
              onClick={() => {
                if (card.comingSoon) return;
                if (card.path) {
                  navigate(card.path);
                } else if (card.title === 'Etiquetas') {
                  setTagsMenuOpen(true);
                }
              }}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className={`p-3 rounded-lg bg-gradient-to-r ${card.gradient}`}>
                    <card.icon className="h-6 w-6 text-white" />
                  </div>
                  <div className="flex items-center gap-2">
                    {card.comingSoon && (
                      <Badge variant="outline" className="text-xs">Em breve</Badge>
                    )}
                    {card.count !== null && !card.comingSoon && (
                      <Badge variant="secondary">{card.count}</Badge>
                    )}
                  </div>
                </div>
                <CardTitle className="text-lg mt-3">{card.title}</CardTitle>
                <CardDescription>{card.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>

        {/* Tags Menu */}
        <InboxMenu open={tagsMenuOpen} onOpenChange={setTagsMenuOpen} />

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total de Contatos</CardDescription>
              <CardTitle className="text-3xl">{contacts.length}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="h-4 w-4" />
                <span>Contatos salvos</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Conversas Hoje</CardDescription>
              <CardTitle className="text-3xl">{todayConversationsCount}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="h-4 w-4" />
                <span>Total de todos os números</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Fluxos Ativos</CardDescription>
              <CardTitle className="text-3xl">{flows.filter(f => f.is_active).length}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Zap className="h-4 w-4" />
                <span>De {flows.length} total</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Números Conectados</CardDescription>
              <CardTitle className="text-3xl">{instances.filter(i => i.status === 'connected').length}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Smartphone className="h-4 w-4" />
                <span>De {instances.length} total</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Chart - Conversations by Day per Instance */}
        {instances.length > 0 && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Conversas por Número (Últimos 7 dias)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={conversationsByDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} 
                  />
                  <YAxis 
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} 
                    allowDecimals={false}
                    domain={[0, 'auto']}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                    formatter={(value: number, name: string) => [value, name]}
                    labelFormatter={(label) => `Data: ${label}`}
                  />
                  <Legend />
                  {instanceNames.map((name, idx) => (
                    <Line 
                      key={name}
                      type="monotone"
                      dataKey={name}
                      stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 4, fill: CHART_COLORS[idx % CHART_COLORS.length] }}
                      activeDot={{ r: 6 }}
                      connectNulls={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Números Conectados Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Smartphone className="h-5 w-5" />
              Números Conectados
            </h2>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handleSyncPhoneNumbers} disabled={syncing || refreshing} size="sm">
                {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Phone className="h-4 w-4 mr-2" />}
                Sincronizar
              </Button>
              <Button variant="outline" size="icon" onClick={handleRefresh} disabled={refreshing || syncing}>
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              </Button>
              <Button onClick={() => setCreateModalOpen(true)} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Novo Número
              </Button>
            </div>
          </div>

          {instances.length === 0 ? (
            <Card className="max-w-md mx-auto">
              <CardContent className="p-8 text-center">
                <Smartphone className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-medium mb-2">Nenhum número conectado</h3>
                <p className="text-muted-foreground mb-4">Adicione seu primeiro número de WhatsApp</p>
                <Button onClick={() => setCreateModalOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Criar Número
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {instances.map((instance) => {
                const instanceFlows = getFlowsForInstance(instance.id);
                const isExpanded = expandedInstances.has(instance.id);
                
                return (
                  <Card key={instance.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">{instance.label || instance.phone_number || instance.instance_name}</CardTitle>
                        <Badge variant="outline" className={`flex items-center gap-1 ${instance.status === 'connected' ? 'border-green-500 text-green-500' : ''}`}>
                          <div className={`w-2 h-2 rounded-full ${getStatusColor(instance.status)}`} />
                          {getStatusText(instance.status)}
                        </Badge>
                      </div>
                      <CardDescription>{instance.phone_number || instance.instance_name}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-xs text-muted-foreground">
                        {instance.last_seen 
                          ? `Último acesso: ${new Date(instance.last_seen).toLocaleString('pt-BR')}`
                          : `Criado: ${new Date(instance.created_at).toLocaleString('pt-BR')}`
                        }
                      </p>

                      {/* Flows attached to this instance */}
                      <Collapsible open={isExpanded} onOpenChange={() => toggleInstanceExpand(instance.id)}>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm" className="w-full justify-between px-2">
                            <span className="flex items-center gap-2">
                              <Zap className="h-3 w-3" />
                              {instanceFlows.length} fluxo(s) atribuído(s)
                            </span>
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="pt-2 space-y-1">
                          {instanceFlows.length === 0 ? (
                            <p className="text-xs text-muted-foreground px-2">Nenhum fluxo atribuído</p>
                          ) : (
                            instanceFlows.map((flow) => (
                              <div key={flow.id} className="flex items-center justify-between px-2 py-1 rounded bg-muted/50">
                                <span className="text-sm">{flow.name}</span>
                                <Badge variant={flow.is_active ? "default" : "secondary"} className="text-[10px]">
                                  {flow.is_active ? 'Ativo' : 'Inativo'}
                                </Badge>
                              </div>
                            ))
                          )}
                        </CollapsibleContent>
                      </Collapsible>

                      <div className="flex gap-2 flex-wrap">
                        {instance.status !== 'connected' && (
                          <Button size="sm" variant="outline" onClick={() => handleGetQrCode(instance)} disabled={actionLoading === instance.id}>
                            <QrCode className="h-3 w-3 mr-1" />
                            QR Code
                          </Button>
                        )}
                        {instance.status === 'connected' && (
                          <Button size="sm" variant="outline" onClick={() => handleLogout(instance)} disabled={actionLoading === instance.id}>
                            {actionLoading === instance.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <PowerOff className="h-3 w-3 mr-1" />}
                            Desconectar
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => handleRestart(instance)} disabled={actionLoading === instance.id}>
                          {actionLoading === instance.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RotateCcw className="h-3 w-3 mr-1" />}
                          Reiniciar
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => { setInstanceToDelete(instance); setDeleteDialogOpen(true); }} disabled={actionLoading === instance.id}>
                          <Trash2 className="h-3 w-3 mr-1" />
                          Excluir
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Create Instance Modal */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Número</DialogTitle>
            <DialogDescription>Crie um novo registro para conectar um número de WhatsApp</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="instanceName">Nome identificador</Label>
              <Input
                id="instanceName"
                placeholder="meu_numero_01"
                value={newInstanceName}
                onChange={(e) => setNewInstanceName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              />
              <p className="text-xs text-muted-foreground">Apenas letras minúsculas, números e underscores</p>
            </div>

            {/* Proxy Configuration (Optional) */}
            <Collapsible open={proxyEnabled} onOpenChange={setProxyEnabled}>
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm" className="w-full justify-between">
                  <span>Configurar Proxy (opcional)</span>
                  {proxyEnabled ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Host</Label>
                    <Input placeholder="proxy.example.com" value={proxyHost} onChange={(e) => setProxyHost(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Porta</Label>
                    <Input placeholder="8080" value={proxyPort} onChange={(e) => setProxyPort(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Protocolo</Label>
                  <select 
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                    value={proxyProtocol}
                    onChange={(e) => setProxyProtocol(e.target.value)}
                  >
                    <option value="http">HTTP</option>
                    <option value="https">HTTPS</option>
                    <option value="socks4">SOCKS4</option>
                    <option value="socks5">SOCKS5</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Usuário (opcional)</Label>
                    <Input placeholder="username" value={proxyUsername} onChange={(e) => setProxyUsername(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Senha (opcional)</Label>
                    <Input type="password" placeholder="password" value={proxyPassword} onChange={(e) => setProxyPassword(e.target.value)} />
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateModalOpen(false); resetCreateForm(); }}>Cancelar</Button>
            <Button onClick={handleCreateInstance} disabled={creating || !newInstanceName}>
              {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR Code Modal */}
      <QRCodeModal
        open={qrModalOpen}
        onOpenChange={setQrModalOpen}
        instanceName={currentQrInstance?.instance_name || ''}
        qrCode={qrCode}
        loading={loadingQr}
        onCheckStatus={handleCheckQrStatus}
        onRefreshQr={handleRefreshQrCode}
        checkingStatus={checkingStatus}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o número "{instanceToDelete?.label || instanceToDelete?.instance_name}"? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
