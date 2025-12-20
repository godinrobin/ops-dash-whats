import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ArrowLeft, Plus, Loader2, MessageSquare, Trash2, Pencil, Play, Pause, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface Instance {
  id: string;
  instance_name: string;
  phone_number: string | null;
  label: string | null;
  status: string;
}

interface Conversation {
  id: string;
  name: string;
  chip_a_id: string | null;
  chip_b_id: string | null;
  is_active: boolean;
  min_delay_seconds: number;
  max_delay_seconds: number;
  messages_per_round: number;
  daily_limit: number;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  topics: string[];
  created_at: string;
  messageCount?: number;
}

export default function MaturadorConversations() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [instances, setInstances] = useState<Instance[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  // Create/Edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingConversation, setEditingConversation] = useState<Conversation | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [chipAId, setChipAId] = useState("");
  const [chipBId, setChipBId] = useState("");
  const [minDelay, setMinDelay] = useState(30);
  const [maxDelay, setMaxDelay] = useState(120);
  const [messagesPerRound, setMessagesPerRound] = useState(5);
  const [dailyLimit, setDailyLimit] = useState(50);
  const [quietStart, setQuietStart] = useState("22:00");
  const [quietEnd, setQuietEnd] = useState("07:00");
  const [topics, setTopics] = useState("");

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<Conversation | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Run conversation
  const [runningConversation, setRunningConversation] = useState<string | null>(null);

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
      
      // Parse topics from JSON and get message counts
      const parsedConversations = await Promise.all((conversationsData || []).map(async (conv) => {
        const { count } = await supabase
          .from('maturador_messages')
          .select('*', { count: 'exact', head: true })
          .eq('conversation_id', conv.id);

        return {
          ...conv,
          topics: Array.isArray(conv.topics) ? conv.topics.map(t => String(t)) : [],
          messageCount: count || 0,
        };
      }));
      
      setConversations(parsedConversations as Conversation[]);

    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  const resetForm = () => {
    setName("");
    setChipAId("");
    setChipBId("");
    setMinDelay(30);
    setMaxDelay(120);
    setMessagesPerRound(5);
    setDailyLimit(50);
    setQuietStart("22:00");
    setQuietEnd("07:00");
    setTopics("");
    setEditingConversation(null);
  };

  const openCreateModal = () => {
    resetForm();
    setModalOpen(true);
  };

  const openEditModal = (conversation: Conversation) => {
    setEditingConversation(conversation);
    setName(conversation.name);
    setChipAId(conversation.chip_a_id || "");
    setChipBId(conversation.chip_b_id || "");
    setMinDelay(conversation.min_delay_seconds);
    setMaxDelay(conversation.max_delay_seconds);
    setMessagesPerRound(conversation.messages_per_round);
    setDailyLimit(conversation.daily_limit);
    setQuietStart(conversation.quiet_hours_start || "22:00");
    setQuietEnd(conversation.quiet_hours_end || "07:00");
    setTopics(conversation.topics.join("\n"));
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Nome da conversa é obrigatório');
      return;
    }
    if (!chipAId || !chipBId) {
      toast.error('Selecione os dois números para a conversa');
      return;
    }
    if (chipAId === chipBId) {
      toast.error('Os números devem ser diferentes');
      return;
    }

    setSaving(true);
    try {
      const topicsArray = topics.split('\n').map(t => t.trim()).filter(t => t);

      const conversationData = {
        user_id: user!.id,
        name,
        chip_a_id: chipAId,
        chip_b_id: chipBId,
        min_delay_seconds: minDelay,
        max_delay_seconds: maxDelay,
        messages_per_round: messagesPerRound,
        daily_limit: dailyLimit,
        quiet_hours_start: quietStart,
        quiet_hours_end: quietEnd,
        topics: topicsArray,
      };

      if (editingConversation) {
        const { error } = await supabase
          .from('maturador_conversations')
          .update(conversationData)
          .eq('id', editingConversation.id);

        if (error) throw error;
        toast.success('Conversa atualizada!');
      } else {
        const { error } = await supabase
          .from('maturador_conversations')
          .insert(conversationData);

        if (error) throw error;
        toast.success('Conversa criada!');
      }

      setModalOpen(false);
      resetForm();
      await fetchData();

    } catch (error: any) {
      console.error('Error saving conversation:', error);
      toast.error(error.message || 'Erro ao salvar conversa');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (conversation: Conversation) => {
    try {
      const { error } = await supabase
        .from('maturador_conversations')
        .update({ is_active: !conversation.is_active })
        .eq('id', conversation.id);

      if (error) throw error;
      
      toast.success(conversation.is_active ? 'Conversa pausada' : 'Conversa ativada');
      await fetchData();
    } catch (error: any) {
      console.error('Error toggling conversation:', error);
      toast.error(error.message || 'Erro ao alterar status');
    }
  };

  const handleRunConversation = async (conversation: Conversation) => {
    if (!conversation.is_active) {
      toast.error('Ative a conversa antes de executar');
      return;
    }

    setRunningConversation(conversation.id);
    try {
      const { data, error } = await supabase.functions.invoke('maturador-evolution', {
        body: { action: 'run-conversation', conversationId: conversation.id },
      });

      if (error) throw error;
      if (data.error) {
        if (data.dailyLimitReached) {
          toast.warning('Limite diário de mensagens atingido');
        } else {
          throw new Error(data.error);
        }
        return;
      }

      toast.success(`${data.messagesSent} mensagens enviadas!`);
      await fetchData();

    } catch (error: any) {
      console.error('Error running conversation:', error);
      toast.error(error.message || 'Erro ao executar conversa');
    } finally {
      setRunningConversation(null);
    }
  };

  const handleDelete = async () => {
    if (!conversationToDelete) return;

    setDeleting(true);
    try {
      const { error } = await supabase
        .from('maturador_conversations')
        .delete()
        .eq('id', conversationToDelete.id);

      if (error) throw error;
      
      toast.success('Conversa removida');
      setDeleteDialogOpen(false);
      setConversationToDelete(null);
      await fetchData();
    } catch (error: any) {
      console.error('Error deleting conversation:', error);
      toast.error(error.message || 'Erro ao remover conversa');
    } finally {
      setDeleting(false);
    }
  };

  const getInstanceName = (id: string | null) => {
    if (!id) return 'N/A';
    const instance = instances.find(i => i.id === id);
    return instance?.label || instance?.phone_number || instance?.instance_name || 'N/A';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (instances.length < 2) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center gap-4 mb-8">
            <Button variant="ghost" size="icon" onClick={() => navigate('/maturador')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-bold">Conversas</h1>
          </div>
          
          <Card className="max-w-md mx-auto">
            <CardContent className="p-8 text-center">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium mb-2">Números Insuficientes</h3>
              <p className="text-muted-foreground mb-4">
                Você precisa de pelo menos 2 números de WhatsApp para criar uma conversa.
              </p>
              <Button onClick={() => navigate('/maturador/instances')}>
                Adicionar Números
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/maturador')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Conversas</h1>
              <p className="text-muted-foreground">Configure pareamentos entre seus números</p>
            </div>
          </div>
          <Button onClick={openCreateModal}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Conversa
          </Button>
        </div>

        {/* Conversations Grid */}
        {conversations.length === 0 ? (
          <Card className="max-w-md mx-auto">
            <CardContent className="p-8 text-center">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium mb-2">Nenhuma conversa</h3>
              <p className="text-muted-foreground mb-4">Crie uma conversa para aquecer seus números</p>
              <Button onClick={openCreateModal}>
                <Plus className="h-4 w-4 mr-2" />
                Criar Conversa
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {conversations.map((conversation) => (
              <Card key={conversation.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{conversation.name}</CardTitle>
                    <Badge className={conversation.is_active ? 'bg-green-500 hover:bg-green-600 text-white' : ''} variant={conversation.is_active ? 'default' : 'secondary'}>
                      {conversation.is_active ? 'Ativa' : 'Pausada'}
                    </Badge>
                  </div>
                  <CardDescription>
                    {getInstanceName(conversation.chip_a_id)} ↔ {getInstanceName(conversation.chip_b_id)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">
                      <MessageSquare className="h-3 w-3 mr-1" />
                      {conversation.messageCount || 0} mensagens trocadas
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>Delay: {conversation.min_delay_seconds}s - {conversation.max_delay_seconds}s</p>
                    <p>Mensagens/round: {conversation.messages_per_round} | Limite diário: {conversation.daily_limit}</p>
                    <p>Silêncio: {conversation.quiet_hours_start} - {conversation.quiet_hours_end}</p>
                    {conversation.topics.length > 0 && (
                      <p>Tópicos: {conversation.topics.length}</p>
                    )}
                  </div>
                  
                  <div className="flex gap-2 flex-wrap">
                    <Button 
                      size="sm" 
                      className={conversation.is_active ? 'bg-green-500 hover:bg-green-600 text-white' : ''}
                      variant={conversation.is_active ? 'default' : 'outline'}
                      onClick={() => handleRunConversation(conversation)}
                      disabled={runningConversation === conversation.id || !conversation.is_active}
                    >
                      {runningConversation === conversation.id ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <Send className="h-3 w-3 mr-1" />
                      )}
                      Executar
                    </Button>

                    <Button 
                      size="sm" 
                      variant={conversation.is_active ? "outline" : "default"}
                      className={!conversation.is_active ? 'bg-green-500 hover:bg-green-600 text-white' : ''}
                      onClick={() => handleToggleActive(conversation)}
                    >
                      {conversation.is_active ? (
                        <>
                          <Pause className="h-3 w-3 mr-1" />
                          Pausar
                        </>
                      ) : (
                        <>
                          <Play className="h-3 w-3 mr-1" />
                          Ativar
                        </>
                      )}
                    </Button>
                    
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => openEditModal(conversation)}
                    >
                      <Pencil className="h-3 w-3 mr-1" />
                      Editar
                    </Button>
                    
                    <Button 
                      size="sm" 
                      variant="destructive"
                      onClick={() => {
                        setConversationToDelete(conversation);
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Excluir
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Create/Edit Modal */}
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingConversation ? 'Editar Conversa' : 'Nova Conversa'}
              </DialogTitle>
              <DialogDescription>
                Configure o pareamento entre dois números de WhatsApp
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome da Conversa</Label>
                <Input
                  id="name"
                  placeholder="Ex: Aquecimento Números 01 e 02"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Número A</Label>
                  <Select value={chipAId} onValueChange={setChipAId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {instances.map((instance) => (
                        <SelectItem key={instance.id} value={instance.id}>
                          {instance.label || instance.phone_number || instance.instance_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Número B</Label>
                  <Select value={chipBId} onValueChange={setChipBId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {instances.map((instance) => (
                        <SelectItem key={instance.id} value={instance.id}>
                          {instance.label || instance.phone_number || instance.instance_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="minDelay">Delay Mínimo (segundos)</Label>
                  <Input
                    id="minDelay"
                    type="number"
                    min={5}
                    value={minDelay}
                    onChange={(e) => setMinDelay(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxDelay">Delay Máximo (segundos)</Label>
                  <Input
                    id="maxDelay"
                    type="number"
                    min={10}
                    value={maxDelay}
                    onChange={(e) => setMaxDelay(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="messagesPerRound">Mensagens por Round</Label>
                  <Input
                    id="messagesPerRound"
                    type="number"
                    min={1}
                    max={20}
                    value={messagesPerRound}
                    onChange={(e) => setMessagesPerRound(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dailyLimit">Limite Diário</Label>
                  <Input
                    id="dailyLimit"
                    type="number"
                    min={1}
                    max={500}
                    value={dailyLimit}
                    onChange={(e) => setDailyLimit(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="quietStart">Início Silêncio</Label>
                  <Input
                    id="quietStart"
                    type="time"
                    value={quietStart}
                    onChange={(e) => setQuietStart(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quietEnd">Fim Silêncio</Label>
                  <Input
                    id="quietEnd"
                    type="time"
                    value={quietEnd}
                    onChange={(e) => setQuietEnd(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="topics">Tópicos (um por linha)</Label>
                <Textarea
                  id="topics"
                  placeholder="Futebol&#10;Música&#10;Filmes&#10;Viagens"
                  value={topics}
                  onChange={(e) => setTopics(e.target.value)}
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">
                  Os tópicos serão usados para gerar mensagens mais naturais
                </p>
              </div>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setModalOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                {editingConversation ? 'Salvar' : 'Criar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir Conversa</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir "{conversationToDelete?.name}"? 
                Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Excluir'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
