import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { InboxSidebar } from './InboxSidebar';
import { ConversationList } from './ConversationList';
import { ChatPanel } from './ChatPanel';
import { ContactDetails } from './ContactDetails';
import { useInboxConversations } from '@/hooks/useInboxConversations';
import { useInboxMessages } from '@/hooks/useInboxMessages';
import { useInboxFlows } from '@/hooks/useInboxFlows';
import { InboxContact } from '@/types/inbox';

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

  const filteredContacts = contacts.filter(contact => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      contact.phone.includes(query) ||
      contact.name?.toLowerCase().includes(query)
    );
  });

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-background">
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
