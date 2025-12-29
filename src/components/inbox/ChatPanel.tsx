import { useRef, useEffect, useState, useMemo } from 'react';
import { User, MessageSquare, Smartphone, ChevronDown, Tag, X, Plus, Pause, Play, Mail, MailOpen, Trash2, AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { InboxContact, InboxMessage } from '@/types/inbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { formatPhoneDisplay } from '@/utils/phoneFormatter';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

// Instance colors for consistency
const instanceColors = [
  'bg-orange-500',
  'bg-blue-500',
  'bg-green-500',
  'bg-purple-500',
  'bg-pink-500',
  'bg-cyan-500',
  'bg-yellow-500',
  'bg-red-500',
];

interface ChatPanelProps {
  contact: InboxContact | null;
  messages: InboxMessage[];
  loading: boolean;
  onSendMessage: (content: string, messageType?: string, mediaUrl?: string) => Promise<{ error?: string; errorCode?: string; data?: any }>;
  onToggleDetails: () => void;
  flows?: { id: string; name: string; is_active: boolean }[];
  onTriggerFlow?: (flowId: string) => void;
  onRefreshContact?: () => void;
  onContactDeleted?: () => void;
}

interface Instance {
  id: string;
  instance_name: string;
  label: string | null;
  phone_number: string | null;
  status: string | null;
}

export const ChatPanel = ({
  contact,
  messages,
  loading,
  onSendMessage,
  onToggleDetails,
  flows = [],
  onTriggerFlow,
  onRefreshContact,
  onContactDeleted,
}: ChatPanelProps) => {
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [instanceName, setInstanceName] = useState<string | null>(null);
  const [addingLabel, setAddingLabel] = useState(false);
  const [contactLabels, setContactLabels] = useState<string[]>([]);
  const [newLabelInput, setNewLabelInput] = useState('');
  const [showNewLabelInput, setShowNewLabelInput] = useState(false);
  const [flowPaused, setFlowPaused] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [connectionError, setConnectionError] = useState<{ show: boolean; errorCode?: string; instanceName?: string }>({ show: false });

  // Predefined labels with colors
  const predefinedLabels = [
    { name: 'Pago', color: 'bg-green-500' },
    { name: 'Pendente', color: 'bg-yellow-500' },
    { name: 'Lead', color: 'bg-blue-500' },
    { name: 'VIP', color: 'bg-purple-500' },
    { name: 'Suporte', color: 'bg-orange-500' },
  ];

  const getLabelColor = (labelName: string) => {
    const predefined = predefinedLabels.find(l => l.name.toLowerCase() === labelName.toLowerCase());
    return predefined?.color || 'bg-gray-500';
  };

  // Fetch all instances once and refresh when contact changes
  useEffect(() => {
    const fetchInstances = async () => {
      const { data } = await supabase
        .from('maturador_instances')
        .select('id, instance_name, label, phone_number, status');
      if (data) {
        setInstances(data);
        
        // Check if current contact's instance is disconnected
        if (contact?.instance_id) {
          const contactInstance = data.find(i => i.id === contact.instance_id);
          if (contactInstance && contactInstance.status !== 'connected') {
            setConnectionError({
              show: true,
              errorCode: 'INSTANCE_DISCONNECTED',
              instanceName: contactInstance.label || contactInstance.instance_name,
            });
          } else {
            // Clear error if instance is now connected
            setConnectionError(prev => prev.errorCode === 'INSTANCE_DISCONNECTED' ? { show: false } : prev);
          }
        }
      }
    };
    fetchInstances();
  }, [contact?.instance_id]);

  // Get instance color map
  const instanceColorMap = useMemo(() => {
    const map = new Map<string, string>();
    instances.forEach((instance, index) => {
      map.set(instance.id, instanceColors[index % instanceColors.length]);
    });
    return map;
  }, [instances]);

  // Fetch instance name for current contact
  useEffect(() => {
    if (!contact?.instance_id) {
      setInstanceName(null);
      return;
    }
    const instance = instances.find(i => i.id === contact.instance_id);
    if (instance) {
      setInstanceName(instance.label || instance.instance_name);
    }
  }, [contact?.instance_id, instances]);

  // Fetch contact labels and flow_paused from tags field
  useEffect(() => {
    if (!contact) {
      setContactLabels([]);
      setFlowPaused(false);
      return;
    }
    const tags = (contact as any).tags;
    if (Array.isArray(tags)) {
      setContactLabels(tags);
    } else if (tags && typeof tags === 'object') {
      setContactLabels(Object.keys(tags));
    } else {
      setContactLabels([]);
    }
    // Get flow_paused status
    setFlowPaused((contact as any).flow_paused || false);
  }, [contact]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleAddLabel = async (labelName: string) => {
    if (!contact || addingLabel || contactLabels.includes(labelName)) return;

    setAddingLabel(true);
    try {
      // Save label locally only (no Evolution API call)
      const newTags = [...contactLabels, labelName];
      const { error } = await supabase
        .from('inbox_contacts')
        .update({ tags: newTags })
        .eq('id', contact.id);

      if (error) {
        console.error('Error adding label:', error);
        toast.error('Erro ao adicionar etiqueta');
        return;
      }

      setContactLabels(newTags);
      toast.success(`Etiqueta "${labelName}" adicionada!`);
    } catch (err) {
      console.error('Error:', err);
      toast.error('Erro ao adicionar etiqueta');
    } finally {
      setAddingLabel(false);
      setShowNewLabelInput(false);
      setNewLabelInput('');
    }
  };

  const handleRemoveLabel = async (labelName: string) => {
    if (!contact) return;

    try {
      // Update local storage only (no Evolution API call)
      const newTags = contactLabels.filter(t => t !== labelName);
      const { error } = await supabase
        .from('inbox_contacts')
        .update({ tags: newTags })
        .eq('id', contact.id);

      if (error) {
        console.error('Error removing label:', error);
        toast.error('Erro ao remover etiqueta');
        return;
      }

      setContactLabels(newTags);
      toast.success(`Etiqueta "${labelName}" removida!`);
    } catch (err) {
      console.error('Error:', err);
      toast.error('Erro ao remover etiqueta');
    }
  };

  const handleAddCustomLabel = () => {
    if (newLabelInput.trim()) {
      handleAddLabel(newLabelInput.trim());
    }
  };

  // Handle pause/resume flow
  const handlePauseFlow = async () => {
    if (!contact) return;
    try {
      const { error } = await supabase
        .from('inbox_contacts')
        .update({ flow_paused: true })
        .eq('id', contact.id);
      
      if (error) throw error;
      setFlowPaused(true);
      toast.success('Funil pausado');
    } catch (err) {
      console.error('Error pausing flow:', err);
      toast.error('Erro ao pausar funil');
    }
  };

  const handleResumeFlow = async () => {
    if (!contact) return;
    try {
      const { error } = await supabase
        .from('inbox_contacts')
        .update({ flow_paused: false })
        .eq('id', contact.id);
      
      if (error) throw error;
      setFlowPaused(false);
      toast.success('Funil retomado');
    } catch (err) {
      console.error('Error resuming flow:', err);
      toast.error('Erro ao retomar funil');
    }
  };

  // Handle mark as read/unread
  const handleMarkAsRead = async () => {
    if (!contact) return;
    try {
      const { error } = await supabase
        .from('inbox_contacts')
        .update({ unread_count: 0 })
        .eq('id', contact.id);
      
      if (error) throw error;
      toast.success('Marcado como lido');
      onRefreshContact?.();
    } catch (err) {
      console.error('Error marking as read:', err);
      toast.error('Erro ao marcar como lido');
    }
  };

  const handleMarkAsUnread = async () => {
    if (!contact) return;
    try {
      const { error } = await supabase
        .from('inbox_contacts')
        .update({ unread_count: 1 })
        .eq('id', contact.id);
      
      if (error) throw error;
      toast.success('Marcado como não lido');
      onRefreshContact?.();
    } catch (err) {
      console.error('Error marking as unread:', err);
      toast.error('Erro ao marcar como não lido');
    }
  };

  // Handle delete contact
  const handleDeleteContact = async () => {
    if (!contact || isDeleting) return;
    
    setIsDeleting(true);
    try {
      // 1. Delete all messages from this contact
      const { error: messagesError } = await supabase
        .from('inbox_messages')
        .delete()
        .eq('contact_id', contact.id);
      
      if (messagesError) {
        console.error('Error deleting messages:', messagesError);
      }

      // 2. Delete flow sessions
      const { error: sessionsError } = await supabase
        .from('inbox_flow_sessions')
        .delete()
        .eq('contact_id', contact.id);
      
      if (sessionsError) {
        console.error('Error deleting flow sessions:', sessionsError);
      }

      // 3. Delete the contact
      const { error: contactError } = await supabase
        .from('inbox_contacts')
        .delete()
        .eq('id', contact.id);
      
      if (contactError) throw contactError;
      
      toast.success('Contato deletado com sucesso');
      onContactDeleted?.();
    } catch (err) {
      console.error('Error deleting contact:', err);
      toast.error('Erro ao deletar contato');
    } finally {
      setIsDeleting(false);
    }
  };

  // Handler for send message with connection error detection
  const handleSendWithErrorDetection = async (content: string, messageType?: string, mediaUrl?: string) => {
    const result = await onSendMessage(content, messageType, mediaUrl);
    
    if (result.errorCode === 'CONNECTION_CLOSED' || result.errorCode === 'INSTANCE_DISCONNECTED') {
      setConnectionError({
        show: true,
        errorCode: result.errorCode,
        instanceName: instanceName || undefined,
      });
    }
    
    return result;
  };

  // Navigate to instances page for reconnection
  const handleReconnectInstance = () => {
    navigate('/maturador/instances');
  };

  if (!contact) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-muted/30">
        <div className="text-center">
          <MessageSquare className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium text-foreground">Selecione uma conversa</h3>
          <p className="text-muted-foreground mt-2">
            Escolha uma conversa na lista para começar
          </p>
        </div>
      </div>
    );
  }

  const getInitials = (name: string | null, phone: string) => {
    if (name && name.trim()) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    // For LID-only contacts (long phone), show "?"
    if (phone.length > 15) return '?';
    return phone.slice(-2);
  };
  
  // Helper to check if this is a LID-only contact (no real phone)
  const isLidContact = (phone: string, remoteJid?: string) => {
    return phone.length > 15 || (remoteJid && remoteJid.includes('@lid'));
  };
  
  // Get display name for contact
  const getDisplayName = () => {
    if (contact.name && contact.name.trim()) {
      return contact.name;
    }
    const remoteJid = (contact as any).remote_jid;
    if (isLidContact(contact.phone, remoteJid)) {
      return 'Desconhecido';
    }
    return contact.phone;
  };
  
  // Get subtitle for contact
  const getContactSubtitle = () => {
    const remoteJid = (contact as any).remote_jid;
    if (isLidContact(contact.phone, remoteJid)) {
      const shortId = contact.phone.slice(-6);
      return `Lead via anúncio • ID ${shortId}`;
    }
    return formatPhoneDisplay(contact.phone);
  };

  const instanceColor = contact.instance_id 
    ? instanceColorMap.get(contact.instance_id) || 'bg-muted'
    : 'bg-muted';

  return (
    <div className="flex-1 flex flex-col bg-background">
      {/* Header */}
      <div className="h-16 border-b border-border flex items-center justify-between px-4 bg-card">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={contact.profile_pic_url || undefined} />
            <AvatarFallback>
              {getInitials(contact.name, contact.phone)}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-medium">{getDisplayName()}</h3>
              {contactLabels.map((label) => (
                <Badge 
                  key={label} 
                  className={cn(
                    "text-white text-[10px] px-1.5 py-0 h-4 cursor-pointer flex items-center gap-1",
                    getLabelColor(label)
                  )}
                  onClick={() => handleRemoveLabel(label)}
                  title="Clique para remover"
                >
                  {label}
                  <X className="h-2.5 w-2.5" />
                </Badge>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">{getContactSubtitle()}</p>
              {instanceName && (
                <Badge 
                  variant="outline" 
                  className={cn(
                    "text-[10px] px-1.5 py-0 h-4 font-normal gap-1 text-white border-0",
                    instanceColor
                  )}
                >
                  <Smartphone className="h-2.5 w-2.5" />
                  {instanceName}
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Flow pause/resume buttons */}
          <TooltipProvider>
            {flowPaused ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-9 w-9 text-green-500 hover:text-green-600 hover:bg-green-500/10"
                    onClick={handleResumeFlow}
                  >
                    <Play className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Continuar Funil</TooltipContent>
              </Tooltip>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-9 w-9 text-orange-500 hover:text-orange-600 hover:bg-orange-500/10"
                    onClick={handlePauseFlow}
                  >
                    <Pause className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Pausar Funil</TooltipContent>
              </Tooltip>
            )}

            {/* Mark as read/unread */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-9 w-9"
                  onClick={handleMarkAsRead}
                >
                  <MailOpen className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Marcar como lido</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-9 w-9"
                  onClick={handleMarkAsUnread}
                >
                  <Mail className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Marcar como não lido</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Label dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9" disabled={addingLabel}>
                <div className="flex items-center">
                  <Tag className="h-4 w-4" />
                  <ChevronDown className="h-3 w-3 ml-0.5" />
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 bg-popover text-popover-foreground border border-border shadow-md z-50">
              {predefinedLabels.map((label) => (
                <DropdownMenuItem 
                  key={label.name}
                  onClick={() => handleAddLabel(label.name)}
                  disabled={contactLabels.includes(label.name)}
                  className="flex items-center gap-2"
                >
                  <div className={cn("w-3 h-3 rounded-full", label.color)} />
                  {label.name}
                  {contactLabels.includes(label.name) && (
                    <span className="text-xs text-muted-foreground ml-auto">✓</span>
                  )}
                </DropdownMenuItem>
              ))}
              <div className="border-t my-1" />
              {showNewLabelInput ? (
                <div className="px-2 py-1.5 flex gap-1">
                  <input
                    type="text"
                    placeholder="Nova etiqueta..."
                    value={newLabelInput}
                    onChange={(e) => setNewLabelInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddCustomLabel();
                      if (e.key === 'Escape') {
                        setShowNewLabelInput(false);
                        setNewLabelInput('');
                      }
                    }}
                    className="flex-1 text-sm bg-transparent border-b border-border focus:outline-none px-1"
                    autoFocus
                  />
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={handleAddCustomLabel}>
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <DropdownMenuItem onClick={() => setShowNewLabelInput(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Nova etiqueta...
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Delete contact */}
          <AlertDialog>
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertDialogTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive/10"
                    disabled={isDeleting}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
              </TooltipTrigger>
              <TooltipContent>Deletar Contato</TooltipContent>
            </Tooltip>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Deletar contato?</AlertDialogTitle>
                <AlertDialogDescription>
                  Isso irá deletar permanentemente o contato, todas as mensagens e sessões de fluxo associadas.
                  O contato poderá acionar o fluxo novamente ao enviar uma nova mensagem.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteContact}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Deletar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={onToggleDetails}>
            <User className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Messages Area */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        {loading && messages.length === 0 ? (
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
                <Skeleton className="h-12 w-48 rounded-lg" />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
            <MessageSquare className="h-12 w-12 mb-4" />
            <p>Nenhuma mensagem ainda</p>
            <p className="text-sm mt-1">Envie uma mensagem para iniciar a conversa</p>
          </div>
        ) : (
          <div className="space-y-2">
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Connection Error Alert */}
      {connectionError.show && (
        <Alert variant="destructive" className="mx-4 mb-2">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Instância Desconectada</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>
              {connectionError.instanceName 
                ? `A instância "${connectionError.instanceName}" perdeu conexão.`
                : 'A instância perdeu conexão com o WhatsApp.'}
            </span>
            <div className="flex gap-2 ml-4">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConnectionError({ show: false })}
                className="text-destructive-foreground bg-transparent border-destructive-foreground/30 hover:bg-destructive-foreground/10"
              >
                Fechar
              </Button>
              <Button
                size="sm"
                onClick={handleReconnectInstance}
                className="bg-background text-foreground hover:bg-background/90"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Reconectar
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Input Area */}
      <ChatInput 
        onSendMessage={handleSendWithErrorDetection} 
        flows={flows} 
        onTriggerFlow={onTriggerFlow} 
        contactInstanceId={contact.instance_id}
      />
    </div>
  );
};
