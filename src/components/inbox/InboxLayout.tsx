import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { InboxSidebar } from './InboxSidebar';
import { ConversationList } from './ConversationList';
import { ChatPanel } from './ChatPanel';
import { ContactDetails } from './ContactDetails';
import { useInboxConversations } from '@/hooks/useInboxConversations';
import { useInboxMessages } from '@/hooks/useInboxMessages';
import { useInboxFlows } from '@/hooks/useInboxFlows';
import { InboxContact } from '@/types/inbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export const InboxLayout = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedContact, setSelectedContact] = useState<InboxContact | null>(null);
  const [showContactDetails, setShowContactDetails] = useState(false);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | undefined>();
  const [searchQuery, setSearchQuery] = useState('');

  const { contacts, loading: contactsLoading } = useInboxConversations(selectedInstanceId);
  const { messages, loading: messagesLoading, sendMessage } = useInboxMessages(selectedContact?.id || null);
  const { flows } = useInboxFlows();

  // Handle URL params for contact selection
  useEffect(() => {
    const contactId = searchParams.get('contact');
    if (!contactId) return;
    if (contactsLoading) return;

    const contact = contacts.find((c) => c.id === contactId);
    if (contact) {
      setSelectedContact(contact);
      return;
    }

    // URL points to a contact that no longer exists (e.g., cleaned up/deleted)
    setSelectedContact(null);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('contact');
      return next;
    });
  }, [searchParams, contacts, contactsLoading, setSearchParams]);

  const handleSelectContact = (contact: InboxContact) => {
    setSelectedContact(contact);
    setSearchParams({ contact: contact.id });
  };

  // Manual flow triggering
  const handleTriggerFlow = useCallback(async (flowId: string) => {
    if (!selectedContact) {
      toast.error('Nenhum contato selecionado');
      return;
    }

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Usuário não autenticado');
        return;
      }

      // Create a new flow session
      const { data: newSession, error: sessionError } = await supabase
        .from('inbox_flow_sessions')
        .insert({
          flow_id: flowId,
          contact_id: selectedContact.id,
          instance_id: selectedContact.instance_id,
          user_id: user.id,
          current_node_id: 'start-1',
          variables: { 
            lastMessage: '', 
            contactName: selectedContact.name || selectedContact.phone 
          },
          status: 'active',
        })
        .select()
        .single();

      if (sessionError) {
        console.error('Error creating flow session:', sessionError);
        toast.error('Erro ao criar sessão do fluxo');
        return;
      }

      // Call the process-inbox-flow edge function
      const { error: invokeError } = await supabase.functions.invoke('process-inbox-flow', {
        body: { sessionId: newSession.id },
      });

      if (invokeError) {
        console.error('Error invoking flow:', invokeError);
        toast.error('Erro ao executar fluxo');
        return;
      }

      toast.success('Fluxo disparado com sucesso!');
    } catch (error) {
      console.error('Error triggering flow:', error);
      toast.error('Erro ao disparar fluxo');
    }
  }, [selectedContact]);

  const filteredContacts = contacts.filter(contact => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      contact.phone.includes(query) ||
      contact.name?.toLowerCase().includes(query)
    );
  });

  return (
    <div className="flex h-[calc(100vh-3.5rem)] md:h-[calc(100vh-4rem)] bg-background">
      {/* Sidebar - Filtros */}
      <InboxSidebar 
        selectedInstanceId={selectedInstanceId}
        onInstanceChange={setSelectedInstanceId}
      />

      {/* Lista de Conversas */}
      <ConversationList
        contacts={filteredContacts}
        loading={contactsLoading}
        selectedContact={selectedContact}
        onSelectContact={handleSelectContact}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      {/* Painel de Chat */}
      <ChatPanel
        contact={selectedContact}
        messages={messages}
        loading={messagesLoading}
        onSendMessage={sendMessage}
        onToggleDetails={() => setShowContactDetails(!showContactDetails)}
        flows={flows.map(f => ({ id: f.id, name: f.name, is_active: f.is_active }))}
        onTriggerFlow={handleTriggerFlow}
      />

      {/* Detalhes do Contato */}
      {showContactDetails && selectedContact && (
        <ContactDetails
          contact={selectedContact}
          onClose={() => setShowContactDetails(false)}
        />
      )}
    </div>
  );
};
