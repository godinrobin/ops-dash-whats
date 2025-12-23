import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AnimatedTabs, AnimatedTabsList, AnimatedTabsTrigger, AnimatedTabsContent } from "@/components/ui/animated-tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, Smartphone, MessageSquare, Users, BarChart3, Plus, RefreshCw, Loader2, ShieldCheck, User, Send, AlertCircle, Pencil, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminStatus } from "@/hooks/useAdminStatus";
import { useActivityTracker } from "@/hooks/useActivityTracker";
import { toast } from "sonner";

interface Instance {
  id: string;
  instance_name: string;
  phone_number: string | null;
  label: string | null;
  status: string;
  last_seen: string | null;
}

interface Conversation {
  id: string;
  name: string;
  is_active: boolean;
  chip_a_id: string | null;
  chip_b_id: string | null;
}

interface VerifiedContact {
  id: string;
  phone: string;
  name: string | null;
  profile_pic_url: string | null;
  last_fetched_at: string | null;
}

interface Stats {
  totalInstances: number;
  connectedInstances: number;
  totalConversations: number;
  activeConversations: number;
  messagesToday: number;
  messagesThisWeek: number;
}

// Format phone for display
const formatPhoneDisplay = (phone: string) => {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 13) {
    return `+${cleaned.slice(0,2)} (${cleaned.slice(2,4)}) ${cleaned.slice(4,9)}-${cleaned.slice(9)}`;
  } else if (cleaned.length === 12) {
    return `+${cleaned.slice(0,2)} (${cleaned.slice(2,4)}) ${cleaned.slice(4,8)}-${cleaned.slice(8)}`;
  } else if (cleaned.length === 11) {
    return `(${cleaned.slice(0,2)}) ${cleaned.slice(2,7)}-${cleaned.slice(7)}`;
  }
  return phone;
};

export default function MaturadorDashboard() {
  useActivityTracker("page_visit", "Maturador de WhatsApp");
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isAdmin } = useAdminStatus();
  const [instances, setInstances] = useState<Instance[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [verifiedContacts, setVerifiedContacts] = useState<VerifiedContact[]>([]);
  const [stats, setStats] = useState<Stats>({
    totalInstances: 0,
    connectedInstances: 0,
    totalConversations: 0,
    activeConversations: 0,
    messagesToday: 0,
    messagesThisWeek: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const hasFetchedContactsRef = useRef(false);
  
  // Send message modal state
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<VerifiedContact | null>(null);
  const [selectedInstanceId, setSelectedInstanceId] = useState("");
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);

  // Admin modals
  const [editContactModalOpen, setEditContactModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<VerifiedContact | null>(null);
  const [editPhone, setEditPhone] = useState("");
  const [editName, setEditName] = useState("");
  const [savingContact, setSavingContact] = useState(false);
  const [deleteContactDialogOpen, setDeleteContactDialogOpen] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<VerifiedContact | null>(null);
  const [deletingContact, setDeletingContact] = useState(false);

  const fetchData = async () => {
    if (!user) return;

    try {
      // Fetch instances
      const { data: instancesData, error: instancesError } = await supabase
        .from('maturador_instances')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (instancesError) throw instancesError;
      setInstances(instancesData || []);

      // Fetch conversations
      const { data: conversationsData, error: conversationsError } = await supabase
        .from('maturador_conversations')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (conversationsError) throw conversationsError;
      setConversations(conversationsData || []);

      // Fetch verified contacts
      const { data: contactsData, error: contactsError } = await supabase
        .from('maturador_verified_contacts')
        .select('*')
        .order('phone');

      if (contactsError) throw contactsError;
      setVerifiedContacts(contactsData || []);

      // Calculate stats
      const connected = (instancesData || []).filter(i => i.status === 'connected').length;
      const active = (conversationsData || []).filter(c => c.is_active).length;

      // Count messages
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      const { count: todayCount } = await supabase
        .from('maturador_messages')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', today.toISOString());

      const { count: weekCount } = await supabase
        .from('maturador_messages')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', weekAgo.toISOString());

      setStats({
        totalInstances: instancesData?.length || 0,
        connectedInstances: connected,
        totalConversations: conversationsData?.length || 0,
        activeConversations: active,
        messagesToday: todayCount || 0,
        messagesThisWeek: weekCount || 0,
      });

      // Trigger background fetch of contact info if needed
      const connectedInstances = (instancesData || []).filter(i => i.status === 'connected');
      const unfetchedContacts = (contactsData || []).filter(c => !c.last_fetched_at);
      
      if (!hasFetchedContactsRef.current && connectedInstances.length > 0 && unfetchedContacts.length > 0) {
        hasFetchedContactsRef.current = true;
        triggerContactInfoFetch(connectedInstances[0].instance_name);
      }

    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  const triggerContactInfoFetch = async (instanceName: string) => {
    try {
      await supabase.functions.invoke('maturador-evolution', {
        body: {
          action: 'fetch-verified-contacts',
          instanceName,
        },
      });
      // Refetch contacts after update
      const { data } = await supabase
        .from('maturador_verified_contacts')
        .select('*')
        .order('phone');
      if (data) setVerifiedContacts(data);
    } catch (error) {
      console.error('Error triggering contact fetch:', error);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  const openSendModal = (contact: VerifiedContact) => {
    setSelectedContact(contact);
    setSelectedInstanceId("");
    setMessageText("");
    setSendModalOpen(true);
  };

  const handleSendMessage = async () => {
    if (!selectedInstanceId || !messageText.trim() || !selectedContact) {
      toast.error('Selecione um número e digite uma mensagem');
      return;
    }

    setSending(true);
    try {
      const instance = instances.find(i => i.id === selectedInstanceId);
      if (!instance) throw new Error('Instância não encontrada');

      const { data, error } = await supabase.functions.invoke('maturador-evolution', {
        body: {
          action: 'send-verified-message',
          instanceName: instance.instance_name,
          phone: selectedContact.phone,
          message: messageText.trim(),
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success('Mensagem enviada com sucesso!');
      setSendModalOpen(false);
      setMessageText("");
    } catch (error: any) {
      console.error('Error sending message:', error);
      toast.error(error.message || 'Erro ao enviar mensagem');
    } finally {
      setSending(false);
    }
  };

  // Admin functions for verified contacts
  const openCreateContactModal = () => {
    setEditingContact(null);
    setEditPhone("");
    setEditName("");
    setEditContactModalOpen(true);
  };

  const openEditContactModal = (contact: VerifiedContact) => {
    setEditingContact(contact);
    setEditPhone(contact.phone);
    setEditName(contact.name || "");
    setEditContactModalOpen(true);
  };

  const handleSaveContact = async () => {
    if (!editPhone.trim()) {
      toast.error('Telefone é obrigatório');
      return;
    }

    const cleanedPhone = editPhone.replace(/\D/g, '');
    if (cleanedPhone.length < 10) {
      toast.error('Telefone inválido');
      return;
    }

    // Find a connected instance to use for fetching profile info
    const connectedInstance = instances.find(i => i.status === 'connected');
    if (!connectedInstance) {
      toast.error('Nenhum número conectado para buscar informações do contato');
      return;
    }

    setSavingContact(true);
    try {
      let contactId: string;
      
      if (editingContact) {
        const { error } = await supabase
          .from('maturador_verified_contacts')
          .update({ 
            phone: cleanedPhone, 
            name: editName.trim() || null,
            last_fetched_at: null
          })
          .eq('id', editingContact.id);

        if (error) throw error;
        contactId = editingContact.id;
      } else {
        const { data, error } = await supabase
          .from('maturador_verified_contacts')
          .insert({ 
            phone: cleanedPhone, 
            name: editName.trim() || null 
          })
          .select('id')
          .single();

        if (error) throw error;
        contactId = data.id;
      }

      // Fetch profile info from Evolution API
      toast.info('Buscando foto de perfil...');
      
      const customName = editName.trim() || null;
      
      try {
        const { data: fetchResult, error: fetchError } = await supabase.functions.invoke('maturador-evolution', {
          body: {
            action: 'fetch-single-contact',
            instanceName: connectedInstance.instance_name,
            phone: cleanedPhone,
            contactId,
            customName, // Pass custom name to preserve it
          },
        });

        if (fetchError) {
          console.error('Error fetching profile:', fetchError);
        } else if (fetchResult?.success) {
          console.log('Profile fetched:', fetchResult);
        }
      } catch (profileError) {
        console.error('Error fetching profile info:', profileError);
      }

      toast.success(editingContact ? 'Contato atualizado!' : 'Contato adicionado!');
      setEditContactModalOpen(false);
      await fetchData();
    } catch (error: any) {
      console.error('Error saving contact:', error);
      toast.error(error.message || 'Erro ao salvar contato');
    } finally {
      setSavingContact(false);
    }
  };

  const handleDeleteContact = async () => {
    if (!contactToDelete) return;

    setDeletingContact(true);
    try {
      const { error } = await supabase
        .from('maturador_verified_contacts')
        .delete()
        .eq('id', contactToDelete.id);

      if (error) throw error;
      
      toast.success('Contato removido');
      setDeleteContactDialogOpen(false);
      setContactToDelete(null);
      await fetchData();
    } catch (error: any) {
      console.error('Error deleting contact:', error);
      toast.error(error.message || 'Erro ao remover contato');
    } finally {
      setDeletingContact(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
    toast.success('Dados atualizados');
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

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent">
                Maturador de WhatsApp
              </h1>
              <p className="text-muted-foreground">Aqueça seus chips com conversas naturais</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <Smartphone className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.connectedInstances}/{stats.totalInstances}</p>
                  <p className="text-xs text-muted-foreground">Números Conectados</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <Users className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.activeConversations}/{stats.totalConversations}</p>
                  <p className="text-xs text-muted-foreground">Conversas Ativas</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/10">
                  <MessageSquare className="h-5 w-5 text-purple-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.messagesToday}</p>
                  <p className="text-xs text-muted-foreground">Mensagens Hoje</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-orange-500/10">
                  <BarChart3 className="h-5 w-5 text-orange-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.messagesThisWeek}</p>
                  <p className="text-xs text-muted-foreground">Mensagens (7 dias)</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <AnimatedTabs defaultValue="instances" className="space-y-4">
          <AnimatedTabsList className="grid w-full grid-cols-3 lg:w-[600px]">
            <AnimatedTabsTrigger value="instances">Números</AnimatedTabsTrigger>
            <AnimatedTabsTrigger value="conversations">Aquecedor</AnimatedTabsTrigger>
            <AnimatedTabsTrigger value="verified">Contatos Verificados</AnimatedTabsTrigger>
          </AnimatedTabsList>

          <AnimatedTabsContent value="instances" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Seus Números</h2>
              <Button onClick={() => navigate('/maturador/instances')}>
                <Plus className="h-4 w-4 mr-2" />
                Novo Número
              </Button>
            </div>

            {instances.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <Smartphone className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-medium mb-2">Nenhum número cadastrado</h3>
                  <p className="text-muted-foreground mb-4">Adicione seus chips de WhatsApp para começar a aquecê-los</p>
                  <Button onClick={() => navigate('/maturador/instances')}>
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar Número
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {instances.slice(0, 6).map((instance) => (
                  <Card key={instance.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate('/maturador/instances')}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">{instance.label || instance.phone_number || instance.instance_name}</CardTitle>
                        <Badge variant="outline" className={`flex items-center gap-1 ${instance.status === 'connected' ? 'border-green-500 text-green-500' : ''}`}>
                          <div className={`w-2 h-2 rounded-full ${getStatusColor(instance.status)}`} />
                          {getStatusText(instance.status)}
                        </Badge>
                      </div>
                      <CardDescription>{instance.phone_number || 'Número não conectado'}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-muted-foreground">
                        {instance.last_seen 
                          ? `Último acesso: ${new Date(instance.last_seen).toLocaleString('pt-BR')}`
                          : 'Nunca conectado'
                        }
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {instances.length > 6 && (
              <div className="text-center">
                <Button variant="outline" onClick={() => navigate('/maturador/instances')}>
                  Ver todos os {instances.length} números
                </Button>
              </div>
            )}
          </AnimatedTabsContent>

          <AnimatedTabsContent value="conversations" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Conversas Configuradas</h2>
              <Button onClick={() => navigate('/maturador/conversations')} disabled={instances.length < 2}>
                <Plus className="h-4 w-4 mr-2" />
                Nova Conversa
              </Button>
            </div>

            {conversations.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <MessageSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-medium mb-2">Nenhuma conversa configurada</h3>
                  <p className="text-muted-foreground mb-4">
                    {instances.length < 2 
                      ? 'Você precisa de pelo menos 2 números para criar uma conversa'
                      : 'Configure conversas entre seus chips para aquecê-los'
                    }
                  </p>
                  <Button onClick={() => navigate('/maturador/conversations')} disabled={instances.length < 2}>
                    <Plus className="h-4 w-4 mr-2" />
                    Criar Conversa
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {conversations.map((conv) => (
                  <Card key={conv.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate('/maturador/conversations')}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">{conv.name}</CardTitle>
                        <Badge className={conv.is_active ? 'bg-green-500 hover:bg-green-600 text-white' : ''} variant={conv.is_active ? 'default' : 'secondary'}>
                          {conv.is_active ? 'Ativa' : 'Pausada'}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-1">
                      <p className="text-sm font-medium">{instances.find(i => i.id === conv.chip_a_id)?.phone_number || instances.find(i => i.id === conv.chip_a_id)?.label || 'N/A'}</p>
                      <p className="text-xs text-muted-foreground">↕</p>
                      <p className="text-sm font-medium">{instances.find(i => i.id === conv.chip_b_id)?.phone_number || instances.find(i => i.id === conv.chip_b_id)?.label || 'N/A'}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </AnimatedTabsContent>

          <AnimatedTabsContent value="verified" className="space-y-4">
            {/* Header with Add Button for Admin */}
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Contatos Verificados</h2>
              {isAdmin && (
                <Button onClick={openCreateContactModal}>
                  <Plus className="h-4 w-4 mr-2" />
                  Novo Contato
                </Button>
              )}
            </div>

            {/* Info Banner */}
            <Card className="border-green-500/30 bg-green-500/5">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="font-medium text-green-500">Por que conversar com contatos verificados?</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Conversar com contatos verificados pela Meta (como bancos, operadoras e empresas conhecidas) 
                      é essencial para aumentar a credibilidade do seu número. Isso ajuda a construir um histórico 
                      positivo e reduz as chances de banimento do seu chip.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Instances Warning */}
            {instances.filter(i => i.status === 'connected').length === 0 && (
              <Card className="border-yellow-500/30 bg-yellow-500/5">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-yellow-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <h3 className="font-medium text-yellow-500">Nenhuma instância conectada</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Você precisa ter pelo menos uma instância de WhatsApp conectada para enviar mensagens aos contatos verificados.
                      </p>
                      <Button variant="outline" size="sm" className="mt-2" onClick={() => navigate('/maturador/instances')}>
                        Conectar Número
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Contacts Grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {verifiedContacts.map((contact) => (
                <Card key={contact.id} className="hover:border-primary/50 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-12 w-12">
                        {contact.profile_pic_url ? (
                          <AvatarImage src={contact.profile_pic_url} alt={contact.name || 'Contato'} />
                        ) : null}
                        <AvatarFallback className="bg-green-500/10 text-green-500">
                          <User className="h-5 w-5" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">
                          {contact.name || 'Contato Verificado'}
                        </p>
                        <p className="text-sm text-muted-foreground truncate">
                          {formatPhoneDisplay(contact.phone)}
                        </p>
                      </div>
                      <Badge variant="outline" className="border-green-500/30 text-green-500 flex-shrink-0">
                        <ShieldCheck className="h-3 w-3 mr-1" />
                        Verificado
                      </Badge>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <Button 
                        className="flex-1" 
                        size="sm"
                        onClick={() => openSendModal(contact)}
                        disabled={instances.filter(i => i.status === 'connected').length === 0}
                      >
                        <Send className="h-4 w-4 mr-2" />
                        Enviar
                      </Button>
                      {isAdmin && (
                        <>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => openEditContactModal(contact)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline"
                            className="text-destructive hover:text-destructive"
                            onClick={() => {
                              setContactToDelete(contact);
                              setDeleteContactDialogOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </AnimatedTabsContent>
        </AnimatedTabs>

        {/* Send Message Modal */}
        <Dialog open={sendModalOpen} onOpenChange={setSendModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Enviar Mensagem</DialogTitle>
              <DialogDescription>
                Enviando para: {selectedContact?.name || formatPhoneDisplay(selectedContact?.phone || '')}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Selecione o número para enviar</Label>
                <Select value={selectedInstanceId} onValueChange={setSelectedInstanceId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um número" />
                  </SelectTrigger>
                  <SelectContent>
                    {instances.filter(i => i.status === 'connected').map((instance) => (
                      <SelectItem key={instance.id} value={instance.id}>
                        {instance.label || instance.phone_number || instance.instance_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Mensagem</Label>
                <Textarea
                  placeholder="Digite sua mensagem..."
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">
                  Envie mensagens naturais e educadas. Evite spam ou mensagens promocionais.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setSendModalOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSendMessage} disabled={sending || !selectedInstanceId || !messageText.trim()}>
                {sending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Enviar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Admin: Edit/Create Contact Modal */}
        {isAdmin && (
          <Dialog open={editContactModalOpen} onOpenChange={setEditContactModalOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingContact ? 'Editar Contato' : 'Novo Contato'}</DialogTitle>
                <DialogDescription>
                  {editingContact ? 'Edite as informações do contato verificado' : 'Adicione um novo contato verificado'}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Telefone *</Label>
                  <Input
                    placeholder="5511999999999"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Digite o número com código do país (ex: 5511999999999)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input
                    placeholder="Nome do contato (opcional)"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setEditContactModalOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleSaveContact} disabled={savingContact || !editPhone.trim()}>
                  {savingContact ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : null}
                  Salvar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* Admin: Delete Contact Confirmation */}
        {isAdmin && (
          <AlertDialog open={deleteContactDialogOpen} onOpenChange={setDeleteContactDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir contato?</AlertDialogTitle>
                <AlertDialogDescription>
                  Tem certeza que deseja excluir o contato "{contactToDelete?.name || formatPhoneDisplay(contactToDelete?.phone || '')}"?
                  Esta ação não pode ser desfeita.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={handleDeleteContact}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={deletingContact}
                >
                  {deletingContact ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Excluir'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
}
