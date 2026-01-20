import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { InboxSidebar } from './InboxSidebar';
import { ConversationList } from './ConversationList';
import { ChatPanel } from './ChatPanel';
import { ContactDetails } from './ContactDetails';
import { GroupList } from './GroupList';
import { GroupChatPanel } from './GroupChatPanel';
import { useInboxConversations } from '@/hooks/useInboxConversations';
import { useInboxMessages } from '@/hooks/useInboxMessages';
import { useInboxFlows } from '@/hooks/useInboxFlows';
import { InboxContact } from '@/types/inbox';
import { WhatsAppGroup } from '@/types/groups';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useActivityTracker } from '@/hooks/useActivityTracker';

export const InboxLayout = () => {
  useActivityTracker("page_visit", "Automati-Zap Inbox");
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedContact, setSelectedContact] = useState<InboxContact | null>(null);
  const [showContactDetails, setShowContactDetails] = useState(false);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | undefined>();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLabel, setSelectedLabel] = useState('');
  
  // View mode: 'conversations' or 'groups'
  const [viewMode, setViewMode] = useState<'conversations' | 'groups'>('conversations');
  const [selectedGroup, setSelectedGroup] = useState<WhatsAppGroup | null>(null);

  const { contacts, loading: contactsLoading, refetch: refetchContacts } = useInboxConversations(selectedInstanceId);
  const { messages, loading: messagesLoading, error: messagesError, sendMessage, refetch: refetchMessages } = useInboxMessages(selectedContact?.id || null);
  const { flows } = useInboxFlows();

  // Handle contact deleted/not found error from messages hook
  useEffect(() => {
    if (messagesError === 'Contact not found' && selectedContact) {
      toast.info('Contato não encontrado. Pode ter sido removido.');
      setSelectedContact(null);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('contact');
        return next;
      });
      refetchContacts();
    }
  }, [messagesError, selectedContact, setSearchParams, refetchContacts]);

  // Handle URL params for contact selection
  useEffect(() => {
    const contactId = searchParams.get('contact');
    if (!contactId) {
      // No contact in URL, clear selection
      if (selectedContact) {
        setSelectedContact(null);
      }
      return;
    }
    if (contactsLoading) return;

    const contact = contacts.find((c) => c.id === contactId);
    if (contact) {
      setSelectedContact(contact);
      return;
    }

    // URL points to a contact that no longer exists (e.g., cleaned up/deleted)
    // Clear the selection and URL param
    console.log('Contact from URL not found in list, clearing:', contactId);
    toast.info('Contato não encontrado. Pode ter sido removido.');
    setSelectedContact(null);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('contact');
      return next;
    });
  }, [searchParams, contacts, contactsLoading, setSearchParams, selectedContact]);

  const handleSelectContact = (contact: InboxContact) => {
    setSelectedContact(contact);
    setSearchParams({ contact: contact.id });
  };
  
  // Handle view mode change
  const handleViewModeChange = (mode: 'conversations' | 'groups') => {
    setViewMode(mode);
    if (mode === 'groups') {
      // Clear contact selection when switching to groups
      setSelectedContact(null);
      setSearchParams({});
    } else {
      // Clear group selection when switching to conversations
      setSelectedGroup(null);
    }
  };

  // Manual flow triggering
  const handleTriggerFlow = useCallback(async (flowId: string) => {
    if (!selectedContact) {
      toast.error('Nenhum contato selecionado');
      return;
    }

    const flowName = flows.find((f) => f.id === flowId)?.name;

    try {
      const { data, error } = await supabase.functions.invoke('trigger-inbox-flow', {
        body: {
          flowId,
          contactId: selectedContact.id,
        },
      });

      if (error) {
        console.error('Error triggering flow:', error);
        toast.error('Erro ao disparar fluxo');
        return;
      }

      if (!(data as any)?.ok) {
        console.error('Unexpected trigger-inbox-flow response:', data);
        toast.error('Erro ao disparar fluxo');
        return;
      }

      toast.success(flowName ? `Fluxo "${flowName}" disparado!` : 'Fluxo disparado com sucesso!');
    } catch (error) {
      console.error('Error triggering flow:', error);
      toast.error('Erro ao disparar fluxo');
    }
  }, [selectedContact, flows]);

  // Filter contacts by search query and label
  const filteredContacts = contacts.filter(contact => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesSearch = contact.phone.includes(query) || contact.name?.toLowerCase().includes(query);
      if (!matchesSearch) return false;
    }
    
    // Label filter
    if (selectedLabel && selectedLabel !== 'all') {
      const contactTags = Array.isArray((contact as any).tags) ? (contact as any).tags : [];
      if (!contactTags.includes(selectedLabel)) return false;
    }
    
    return true;
  });

  return (
    <div className="flex h-[calc(100vh-3.5rem)] md:h-[calc(100vh-4rem)] bg-background relative">
      {/* Back button */}
      <Button 
        variant="ghost" 
        size="icon" 
        className="absolute top-2 left-2 z-20 h-8 w-8"
        onClick={() => navigate('/inbox')}
      >
        <ArrowLeft className="h-4 w-4" />
      </Button>

      {/* Sidebar - Filtros */}
      <InboxSidebar 
        selectedInstanceId={selectedInstanceId}
        onInstanceChange={setSelectedInstanceId}
      />

      {/* Lista de Conversas ou Grupos */}
      {viewMode === 'conversations' ? (
        <ConversationList
          contacts={filteredContacts}
          loading={contactsLoading}
          selectedContact={selectedContact}
          onSelectContact={handleSelectContact}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          selectedLabel={selectedLabel}
          onLabelChange={setSelectedLabel}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
        />
      ) : (
        <GroupList
          selectedGroup={selectedGroup}
          onSelectGroup={setSelectedGroup}
          selectedInstanceId={selectedInstanceId}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
        />
      )}

      {/* Painel de Chat ou Grupo */}
      {viewMode === 'conversations' ? (
        <ChatPanel
          contact={selectedContact}
          messages={messages}
          loading={messagesLoading}
          onSendMessage={sendMessage}
          onToggleDetails={() => setShowContactDetails(!showContactDetails)}
          flows={flows
            .filter(f => {
              // Se o fluxo não tem instâncias atribuídas, mostrar para todos
              if (!f.assigned_instances || f.assigned_instances.length === 0) {
                return true;
              }
              // Se o contato não tem instância, não mostrar fluxos com instâncias específicas
              if (!selectedContact?.instance_id) {
                return false;
              }
              // Mostrar apenas fluxos atribuídos à instância do contato
              return f.assigned_instances.includes(selectedContact.instance_id);
            })
            .map(f => ({ id: f.id, name: f.name, is_active: f.is_active }))}
          onTriggerFlow={handleTriggerFlow}
          onRefreshContact={refetchContacts}
          onContactDeleted={() => {
            setSelectedContact(null);
            setSearchParams((prev) => {
              const next = new URLSearchParams(prev);
              next.delete('contact');
              return next;
            });
            refetchContacts();
          }}
        />
      ) : (
        <GroupChatPanel group={selectedGroup} />
      )}

      {/* Detalhes do Contato */}
      {showContactDetails && selectedContact && viewMode === 'conversations' && (
        <ContactDetails
          contact={selectedContact}
          onClose={() => setShowContactDetails(false)}
        />
      )}
    </div>
  );
};
