import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { SystemLayout } from "@/components/layout/SystemLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowLeft, MessageSquare, Smartphone, GitBranch, Bell, Plus, RefreshCw, Loader2, QrCode, Trash2, PowerOff, RotateCcw, ChevronDown, ChevronRight, Phone, Zap, Users, TrendingUp, Filter, Check, Hash, Wifi, MapPin, CheckCircle, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffectiveUser } from "@/hooks/useEffectiveUser";
import { useAutoCheckConnectingInstances } from "@/hooks/useAutoCheckConnectingInstances";
import { toast } from "sonner";
import automatizapIcon from "@/assets/automatizap-icon.png";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';
import { InboxMenu } from '@/components/inbox/InboxMenu';
import { cn } from '@/lib/utils';
import { useActivityTracker } from '@/hooks/useActivityTracker';
import { QRCodeModal, clearQrCodeCache, setQrCodeCache } from "@/components/QRCodeModal";
import { PairCodeModal } from "@/components/PairCodeModal";
import { useProxyValidator } from "@/hooks/useProxyValidator";

interface Instance {
  id: string;
  instance_name: string;
  phone_number: string | null;
  label: string | null;
  status: string;
  qrcode: string | null;
  last_seen: string | null;
  created_at: string;
  proxy_string: string | null;
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
  const [chartFilterInstances, setChartFilterInstances] = useState<Set<string>>(new Set()); // Empty = show all

  // Create instance modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newInstanceName, setNewInstanceName] = useState("");
  const [creating, setCreating] = useState(false);
  
  // Proxy configuration (optional) - now accepts SOCKS5 string only
  const [proxyEnabled, setProxyEnabled] = useState(false);
  const [proxyString, setProxyString] = useState("");
  

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

  // Pair code modal
  const [pairCodeModalOpen, setPairCodeModalOpen] = useState(false);
  const [currentPairCodeInstance, setCurrentPairCodeInstance] = useState<Instance | null>(null);

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  
  // Proxy validation
  const { validateProxy, validating: validatingProxy, result: proxyValidationResult, clearResult: clearProxyResult } = useProxyValidator();
  
  // Card proxy validation state (per-instance)
  const [validatingInstanceProxy, setValidatingInstanceProxy] = useState<string | null>(null);
  const [instanceProxyResults, setInstanceProxyResults] = useState<Record<string, { ip?: string; location?: string; latency_ms?: number; error?: string }>>({});
  const [openWifiPopoverId, setOpenWifiPopoverId] = useState<string | null>(null);

  // Handle card WiFi icon click to fetch instance IP/location (with or without proxy)
  const handleValidateInstanceProxy = async (instance: Instance) => {
    setValidatingInstanceProxy(instance.id);

    try {
      // For proxy-configured instances, validate the proxy directly
      if (instance.proxy_string) {
        const result = await validateProxy(instance.proxy_string);
        setInstanceProxyResults((prev) => ({
          ...prev,
          [instance.id]: {
            ip: result?.ip,
            location: result?.location,
            latency_ms: result?.latency_ms,
            error: result?.valid ? undefined : result?.error,
          },
        }));
        return;
      }

      // For instances without local proxy_string, fetch proxy info from UAZAPI directly
      const { data, error } = await supabase.functions.invoke('maturador-evolution', {
        body: { action: 'get-instance-proxy', instanceId: instance.id },
      });

      // Handle edge function errors gracefully (including 401 from UAZAPI)
      let edgeError: string | null = null;
      if (error) {
        try {
          const body = (error as any)?.context?.body;
          if (typeof body === 'string') {
            const parsed = JSON.parse(body);
            edgeError = parsed?.error || error.message;
          } else if (body?.error) {
            edgeError = body.error;
          } else {
            edgeError = error.message;
          }
        } catch {
          edgeError = error.message || 'Erro desconhecido';
        }
      }

      if (edgeError || !data?.success) {
        const message = edgeError || data?.error || 'Não foi possível obter informações da proxy';
        setInstanceProxyResults((prev) => ({
          ...prev,
          [instance.id]: { error: message },
        }));
        return;
      }

      // Extract IP and location from response
      const ip = data?.ip || null;
      const location = data?.location || null;
      const proxyInfo = data?.proxy || {};
      
      if (!ip) {
        setInstanceProxyResults((prev) => ({
          ...prev,
          [instance.id]: { error: 'Não foi possível obter o IP da instância' },
        }));
        return;
      }

      setInstanceProxyResults((prev) => ({
        ...prev,
        [instance.id]: {
          ip,
          location,
          latency_ms: data?.latency_ms,
          error: proxyInfo.validation_error ? proxyInfo.last_test_error : undefined,
        },
      }));
    } catch (err) {
      console.error('[handleValidateInstanceProxy] Unexpected error:', err);
      setInstanceProxyResults((prev) => ({
        ...prev,
        [instance.id]: { error: 'Erro ao validar proxy' },
      }));
    } finally {
      setValidatingInstanceProxy(null);
    }
  };

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

  const refreshInstancesOnly = useCallback(async () => {
    const userId = effectiveUserId || user?.id;
    if (!userId) return;

    try {
      const { data, error } = await supabase
        .from('maturador_instances')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setInstances(data || []);
    } catch (error) {
      console.error('Error refreshing instances:', error);
    }
  }, [effectiveUserId, user?.id]);

  // While there are instances in "connecting", keep polling status so it flips to "connected" automatically
  useAutoCheckConnectingInstances(instances, refreshInstancesOnly, { enabled: !!(effectiveUserId || user?.id), intervalMs: 4000 });

  // Fase 2: Carrega dados secundários em background (contatos e mensagens)
  const fetchSecondaryData = async () => {
    const userId = effectiveUserId || user?.id;
    if (!userId) return;

    try {
      // Pega mensagens dos últimos 7 dias
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      // Use count: 'exact' to get accurate counts beyond 1000 limit
      const [contactsCountRes, contactsRes, messagesRes] = await Promise.all([
        // Get exact count of contacts (bypasses 1000 limit)
        supabase.from('inbox_contacts').select('*', { count: 'exact', head: true }).eq('user_id', userId),
        // Get contacts with instance_id for grouping (limited to 1000 for display, but count is accurate)
        supabase.from('inbox_contacts').select('id, instance_id, created_at').eq('user_id', userId).limit(10000),
        supabase.from('inbox_messages').select('id, instance_id, contact_id, created_at, direction').eq('user_id', userId).gte('created_at', sevenDaysAgo.toISOString()).order('created_at', { ascending: false }).limit(10000),
      ]);

      // Use count if available, otherwise use data length
      if (contactsRes.data) {
        // Inject the exact count into the contacts array for accurate total
        const contactsWithCount = contactsRes.data;
        (contactsWithCount as any)._exactCount = contactsCountRes.count || contactsRes.data.length;
        setContacts(contactsWithCount);
      }
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
    if (!user) return; // Don't call when not authenticated
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
    if (!user) return; // Don't call when not authenticated
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
    if (!user) return; // Don't call when not authenticated
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
  // IMPORTANT: Only run when user is authenticated
  useEffect(() => {
    if (user && instances.length > 0 && !loading) {
      // Auto-heal webhooks first (force reconfigure)
      setTimeout(() => autoHealWebhooks(), 1000);
      // Then verify webhooks
      setTimeout(() => verifyWebhooks(), 3000);
      // Enable ignoreGroups on all connected instances (após webhooks)
      setTimeout(() => enableIgnoreGroupsOnAllInstances(), 5000);
    }
  }, [user, instances, loading]);

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
      if (proxyEnabled && proxyString) {
        const parsed = parseSocks5String(proxyString);
        if (parsed) {
          body.proxy = parsed;
        } else {
          toast.error('Formato de proxy inválido. Use: socks5://usuario:senha@host:porta');
          setCreating(false);
          return;
        }
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
    setProxyString("");
    clearProxyResult();
  };

  const handleValidateProxy = async () => {
    if (!proxyString) {
      toast.error('Digite a string de proxy primeiro');
      return;
    }
    await validateProxy(proxyString);
  };

  // Parse SOCKS5 string format: socks5://username:password@host:port
  const parseSocks5String = (str: string) => {
    try {
      const regex = /^socks5:\/\/([^:]+):([^@]+)@([^:]+):(\d+)$/;
      const match = str.match(regex);
      if (match) {
        return {
          protocol: 'socks5',
          username: match[1],
          password: match[2],
          host: match[3],
          port: match[4]
        };
      }
      return null;
    } catch {
      return null;
    }
  };

  const handleGetQrCode = useCallback(async (instance: Instance) => {
    setCurrentQrInstance(instance);
    setQrModalOpen(true);
    setLoadingQr(true);
    setQrCode(null);

    // Always force a fresh QR (cached QR can be invalidated server-side and cause WhatsApp to fail pairing)
    clearQrCodeCache(instance.instance_name);

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
      } else {
        toast.error('QR Code não disponível. Tente novamente.');
      }
    } catch (error: any) {
      console.error('Error getting QR code:', error);
      toast.error(error.message || 'Erro ao obter QR Code');
      setQrModalOpen(false);
    } finally {
      setLoadingQr(false);
    }
  }, [fetchData]);

  const handleRefreshQrCode = useCallback(async () => {
    if (!currentQrInstance) return;
    setLoadingQr(true);
    setQrCode(null);

    clearQrCodeCache(currentQrInstance.instance_name);
    
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
  }, [currentQrInstance, fetchData]);

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
        data?.status === 'connecting' ||
        (data?.status?.loggedIn === true && data?.status?.connected === false);

      // Check for connection status
      const isConnected = !isConnecting && (
        data.instance?.state === 'open' ||
        (data.status?.connected === true && data.status?.loggedIn === true) ||
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

  // Get unique instance names for chart lines (with id mapping)
  const instanceNamesWithIds = useMemo(() => {
    return instances.map(i => ({
      id: i.id,
      name: i.label || i.instance_name || i.phone_number || 'Desconhecido'
    }));
  }, [instances]);

  // Filter instance names for chart based on selection
  const filteredInstanceNames = useMemo(() => {
    if (chartFilterInstances.size === 0) {
      // No filter = show all
      return instanceNamesWithIds.map(i => i.name);
    }
    return instanceNamesWithIds
      .filter(i => chartFilterInstances.has(i.id))
      .map(i => i.name);
  }, [instanceNamesWithIds, chartFilterInstances]);

  // Toggle instance filter
  const toggleChartFilter = (instanceId: string) => {
    const newFilter = new Set(chartFilterInstances);
    if (newFilter.has(instanceId)) {
      newFilter.delete(instanceId);
    } else {
      newFilter.add(instanceId);
    }
    setChartFilterInstances(newFilter);
  };

  // Select all / clear all for chart filter
  const selectAllChartFilter = () => {
    setChartFilterInstances(new Set(instances.map(i => i.id)));
  };

  const clearChartFilter = () => {
    setChartFilterInstances(new Set());
  };

  if (loading) {
    return (
      <SystemLayout>
        <div className="min-h-screen bg-background">
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
      </SystemLayout>
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
      title: "Respostas Rápidas", 
      description: "Crie atalhos para mensagens frequentes", 
      icon: MessageSquare, 
      path: "/inbox/quick-replies",
      count: null,
      gradient: "from-amber-400 to-orange-500",
      comingSoon: false,
    },
    { 
      title: "Kanban", 
      description: "Visualize e organize leads em pipeline", 
      icon: Users, 
      path: "/inbox/kanban",
      count: (contacts as any)._exactCount || contacts.length,
      gradient: "from-purple-400 to-pink-500",
      comingSoon: false,
    },
  ];

  return (
    <SystemLayout>
      <div className="min-h-screen bg-background">
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
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
              <CardTitle className="text-3xl">{(contacts as any)._exactCount || contacts.length}</CardTitle>
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
              <div className="flex items-center justify-between flex-wrap gap-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Conversas por Número (Últimos 7 dias)
                </CardTitle>
                
                {/* Instance Filter */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                      <Filter className="h-4 w-4" />
                      Filtrar Instâncias
                      {chartFilterInstances.size > 0 && (
                        <Badge variant="secondary" className="ml-1">
                          {chartFilterInstances.size}
                        </Badge>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80" align="end">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium text-sm">Filtrar por Instância</h4>
                        <div className="flex gap-2">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-7 text-xs"
                            onClick={selectAllChartFilter}
                          >
                            Todos
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-7 text-xs"
                            onClick={clearChartFilter}
                          >
                            Limpar
                          </Button>
                        </div>
                      </div>
                      <div className="max-h-60 overflow-y-auto space-y-2">
                        {instanceNamesWithIds.map((inst, idx) => (
                          <div 
                            key={inst.id} 
                            className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer"
                            onClick={() => toggleChartFilter(inst.id)}
                          >
                            <Checkbox
                              checked={chartFilterInstances.size === 0 || chartFilterInstances.has(inst.id)}
                              onCheckedChange={() => toggleChartFilter(inst.id)}
                            />
                            <div 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
                            />
                            <span className="text-sm truncate flex-1">{inst.name}</span>
                          </div>
                        ))}
                      </div>
                      {chartFilterInstances.size > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {chartFilterInstances.size} de {instances.length} selecionado(s)
                        </p>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
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
                  <RechartsTooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                    formatter={(value: number, name: string) => [value, name]}
                    labelFormatter={(label) => `Data: ${label}`}
                  />
                  <Legend />
                  {filteredInstanceNames.map((name, idx) => {
                    // Get original color index based on all instances
                    const originalIdx = instanceNamesWithIds.findIndex(i => i.name === name);
                    const colorIdx = originalIdx >= 0 ? originalIdx : idx;
                    return (
                      <Line 
                        key={name}
                        type="monotone"
                        dataKey={name}
                        stroke={CHART_COLORS[colorIdx % CHART_COLORS.length]}
                        strokeWidth={2}
                        dot={{ r: 4, fill: CHART_COLORS[colorIdx % CHART_COLORS.length] }}
                        activeDot={{ r: 6 }}
                        connectNulls={false}
                      />
                    );
                  })}
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
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-base">{instance.label || instance.phone_number || instance.instance_name}</CardTitle>
                          {/* WiFi icon: click/tap opens details; if proxy exists it also validates IP/location */}
                          <Popover
                            open={openWifiPopoverId === instance.id}
                            onOpenChange={(open) => setOpenWifiPopoverId(open ? instance.id : null)}
                          >
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenWifiPopoverId(instance.id);
                                  void handleValidateInstanceProxy(instance);
                                }}
                                disabled={validatingInstanceProxy === instance.id}
                                className={`p-1 rounded hover:bg-muted transition-colors ${
                                  instance.proxy_string
                                    ? (instanceProxyResults[instance.id]?.ip && !instanceProxyResults[instance.id]?.error
                                        ? 'text-green-500'
                                        : instanceProxyResults[instance.id]?.error
                                          ? 'text-red-500'
                                          : 'text-muted-foreground')
                                    : instance.status === 'connected'
                                      ? 'text-green-500'
                                      : 'text-muted-foreground'
                                }`}
                                aria-label={instance.proxy_string ? 'Validar proxy (IP e localização)' : 'Detalhes da conexão'}
                                title={instance.proxy_string ? 'Clique para validar proxy' : 'Clique para ver detalhes'}
                              >
                                {validatingInstanceProxy === instance.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Wifi className="h-4 w-4" />
                                )}
                              </button>
                            </PopoverTrigger>
                            <PopoverContent side="top" className="max-w-xs">
                              <div className="text-xs space-y-2">
                                <div className="space-y-1">
                                  <p className="font-medium">Conexão</p>
                                  <p className="text-muted-foreground">Número: {instance.phone_number || 'N/A'}</p>
                                  {instance.last_seen && (
                                    <p className="text-muted-foreground">
                                      Último acesso: {new Date(instance.last_seen).toLocaleString('pt-BR')}
                                    </p>
                                  )}
                                </div>

                                <div className="h-px bg-border" />

                                <div className="space-y-1">
                                  <p className="font-medium">IP e localização</p>
                                  <p className="text-muted-foreground">
                                    {instance.proxy_string ? 'Via proxy' : 'Sem proxy (IP padrão)'}
                                  </p>
                                  {validatingInstanceProxy === instance.id ? (
                                    <p className="text-muted-foreground">Consultando IP e localização...</p>
                                  ) : instanceProxyResults[instance.id]?.error ? (
                                    <p className="text-red-500">{instanceProxyResults[instance.id]?.error}</p>
                                  ) : instanceProxyResults[instance.id]?.ip ? (
                                    <div className="space-y-0.5">
                                      <p className="text-green-500 font-medium">IP: {instanceProxyResults[instance.id]?.ip}</p>
                                      {instanceProxyResults[instance.id]?.location && (
                                        <p className="text-muted-foreground">{instanceProxyResults[instance.id]?.location}</p>
                                      )}
                                      {instanceProxyResults[instance.id]?.latency_ms && (
                                        <p className="text-muted-foreground">({instanceProxyResults[instance.id]?.latency_ms}ms)</p>
                                      )}
                                    </div>
                                  ) : (
                                    <p className="text-muted-foreground">Clique no ícone para consultar IP e localização.</p>
                                  )}
                                </div>
                              </div>
                            </PopoverContent>
                          </Popover>
                        </div>
                        {/* IP info is now only shown inside the popover - removed from card */}
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
                          <>
                            <Button size="sm" variant="outline" onClick={() => { setCurrentPairCodeInstance(instance); setPairCodeModalOpen(true); }} disabled={actionLoading === instance.id}>
                              <Hash className="h-3 w-3 mr-1" />
                              Código
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => handleGetQrCode(instance)} disabled={actionLoading === instance.id}>
                              <QrCode className="h-3 w-3 mr-1" />
                              QR Code
                            </Button>
                          </>
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
                <div className="space-y-2">
                  <Label>String SOCKS5 do Marketplace</Label>
                  <Input 
                    placeholder="socks5://usuario:senha@host:porta" 
                    value={proxyString} 
                    onChange={(e) => {
                      setProxyString(e.target.value);
                      clearProxyResult();
                    }} 
                  />
                  <p className="text-xs text-muted-foreground">
                    Cole a string de proxy gerada pelo Marketplace no formato SOCKS5
                  </p>
                  
                  {/* Validate Proxy Button */}
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm" 
                    onClick={handleValidateProxy}
                    disabled={validatingProxy || !proxyString}
                    className="w-full"
                  >
                    {validatingProxy ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Wifi className="h-4 w-4 mr-2" />
                    )}
                    Validar IP
                  </Button>
                  
                  {/* Validation Result */}
                  {proxyValidationResult && (
                    <div className={`p-3 rounded-lg border ${proxyValidationResult.valid ? 'border-green-500/30 bg-green-500/10' : 'border-red-500/30 bg-red-500/10'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        {proxyValidationResult.valid ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500" />
                        )}
                        <span className={`text-sm font-medium ${proxyValidationResult.valid ? 'text-green-500' : 'text-red-500'}`}>
                          {proxyValidationResult.valid ? 'Proxy Válida' : 'Proxy Inválida'}
                        </span>
                      </div>
                      {proxyValidationResult.valid && proxyValidationResult.ip && (
                        <div className="text-xs text-muted-foreground space-y-1">
                          <div className="flex items-center gap-1">
                            <span className="font-medium">IP:</span> {proxyValidationResult.ip}
                          </div>
                          {proxyValidationResult.location && (
                            <div className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              <span>{proxyValidationResult.location}</span>
                            </div>
                          )}
                          {proxyValidationResult.latency_ms && (
                            <div className="flex items-center gap-1">
                              <span className="font-medium">Latência:</span> {proxyValidationResult.latency_ms}ms
                            </div>
                          )}
                        </div>
                      )}
                      {!proxyValidationResult.valid && proxyValidationResult.error && (
                        <p className="text-xs text-red-400">{proxyValidationResult.error}</p>
                      )}
                    </div>
                  )}
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

      {/* Pair Code Modal */}
      <PairCodeModal
        open={pairCodeModalOpen}
        onOpenChange={setPairCodeModalOpen}
        instanceName={currentPairCodeInstance?.instance_name || ''}
        onSuccess={fetchEssentialData}
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
    </SystemLayout>
  );
}
