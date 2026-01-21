import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { SystemLayout } from '@/components/layout/SystemLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, Plus, Phone, User, Tag, Hash, GripVertical, Search, X, MessageSquare, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useEffectiveUser } from '@/hooks/useEffectiveUser';
import { useActivityTracker } from '@/hooks/useActivityTracker';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatPhoneDisplay } from '@/utils/phoneFormatter';
import automatizapIcon from '@/assets/automatizap-icon.png';

import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface KanbanContact {
  id: string;
  name: string | null;
  phone: string;
  profile_pic_url: string | null;
  tags: string[];
  instance_id: string | null;
  last_message_at: string | null;
  unread_count: number;
  notes: string | null;
  ad_source_url: string | null;
  created_at: string;
}

interface Instance {
  id: string;
  instance_name: string;
  phone_number: string | null;
  label: string | null;
}

interface InboxTag {
  id: string;
  name: string;
  color: string;
}

const predefinedLabels = [
  { name: 'Lead', color: '#3b82f6' },
  { name: 'Pendente', color: '#eab308' },
  { name: 'Pago', color: '#22c55e' },
  { name: 'VIP', color: '#a855f7' },
  { name: 'Suporte', color: '#f97316' },
];

const getTagColor = (tagName: string, customTags: InboxTag[]): string => {
  const predefined = predefinedLabels.find(l => l.name.toLowerCase() === tagName.toLowerCase());
  if (predefined) return predefined.color;
  const custom = customTags.find(t => t.name.toLowerCase() === tagName.toLowerCase());
  return custom?.color || '#6b7280';
};

// Draggable card component
const KanbanCard = ({ 
  contact, 
  instances, 
  customTags, 
  onClick 
}: { 
  contact: KanbanContact; 
  instances: Instance[]; 
  customTags: InboxTag[];
  onClick: () => void;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: contact.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const instance = instances.find(i => i.id === contact.instance_id);
  const instanceLabel = instance?.phone_number || instance?.label || instance?.instance_name || 'Sem número';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "bg-card border border-border rounded-lg p-3 cursor-pointer hover:border-accent transition-all group",
        isDragging && "shadow-lg ring-2 ring-accent"
      )}
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        {/* Drag handle */}
        <div 
          {...attributes} 
          {...listeners}
          className="mt-1 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>

        {/* Profile pic */}
        <div className="flex-shrink-0">
          {contact.profile_pic_url ? (
            <img 
              src={contact.profile_pic_url} 
              alt={contact.name || 'Contact'} 
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
              <User className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
        </div>

        {/* Contact info */}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">
            {contact.name || formatPhoneDisplay(contact.phone)}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {formatPhoneDisplay(contact.phone)}
          </p>
          
          {/* Tags */}
          <div className="flex flex-wrap gap-1 mt-2">
            {contact.tags.slice(0, 2).map(tag => (
              <Badge 
                key={tag}
                className="text-[10px] px-1.5 py-0 text-white"
                style={{ backgroundColor: getTagColor(tag, customTags) }}
              >
                {tag}
              </Badge>
            ))}
            {contact.tags.length > 2 && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                +{contact.tags.length - 2}
              </Badge>
            )}
          </div>

          {/* Instance number */}
          <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
            <Phone className="h-3 w-3" />
            <span className="truncate">{formatPhoneDisplay(instanceLabel)}</span>
          </div>
        </div>

        {/* Unread badge */}
        {contact.unread_count > 0 && (
          <Badge className="bg-green-500 text-white text-xs">
            {contact.unread_count}
          </Badge>
        )}
      </div>
    </div>
  );
};

// Column component
const KanbanColumn = ({ 
  tag, 
  contacts, 
  instances, 
  customTags, 
  color,
  onCardClick,
}: {
  tag: string;
  contacts: KanbanContact[];
  instances: Instance[];
  customTags: InboxTag[];
  color: string;
  onCardClick: (contact: KanbanContact) => void;
}) => {
  return (
    <div className="flex-shrink-0 w-[300px] bg-muted/30 rounded-lg border border-border">
      {/* Column header */}
      <div 
        className="p-3 border-b border-border flex items-center justify-between"
        style={{ borderTopColor: color, borderTopWidth: 3, borderTopLeftRadius: 8, borderTopRightRadius: 8 }}
      >
        <div className="flex items-center gap-2">
          <div 
            className="w-3 h-3 rounded-full" 
            style={{ backgroundColor: color }} 
          />
          <h3 className="font-semibold text-sm">{tag}</h3>
        </div>
        <Badge variant="secondary" className="text-xs">
          {contacts.length}
        </Badge>
      </div>

      {/* Column content */}
      <ScrollArea className="h-[calc(100vh-300px)]">
        <div className="p-2 space-y-2">
          <SortableContext 
            items={contacts.map(c => c.id)} 
            strategy={verticalListSortingStrategy}
          >
            {contacts.map(contact => (
              <KanbanCard
                key={contact.id}
                contact={contact}
                instances={instances}
                customTags={customTags}
                onClick={() => onCardClick(contact)}
              />
            ))}
          </SortableContext>
          
          {contacts.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <Tag className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Nenhum lead</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

// Contact detail modal
const ContactDetailModal = ({
  contact,
  open,
  onOpenChange,
  instances,
  customTags,
  allTags,
  onNavigateToChat,
  onTagChange,
}: {
  contact: KanbanContact | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instances: Instance[];
  customTags: InboxTag[];
  allTags: string[];
  onNavigateToChat: (contactId: string) => void;
  onTagChange: (contactId: string, newTags: string[]) => void;
}) => {
  if (!contact) return null;

  const instance = instances.find(i => i.id === contact.instance_id);
  const instanceLabel = instance?.phone_number || instance?.label || instance?.instance_name || 'Sem número';

  const handleToggleTag = (tag: string) => {
    const newTags = contact.tags.includes(tag)
      ? contact.tags.filter(t => t !== tag)
      : [...contact.tags, tag];
    onTagChange(contact.id, newTags);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {contact.profile_pic_url ? (
              <img 
                src={contact.profile_pic_url} 
                alt={contact.name || 'Contact'} 
                className="w-12 h-12 rounded-full object-cover"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <User className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
            <div>
              <p className="font-semibold">{contact.name || 'Sem nome'}</p>
              <p className="text-sm font-normal text-muted-foreground">
                {formatPhoneDisplay(contact.phone)}
              </p>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Instance info */}
          <div className="flex items-center gap-2 text-sm">
            <Phone className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Número fonte:</span>
            <span>{formatPhoneDisplay(instanceLabel)}</span>
          </div>

          {/* Created at */}
          <div className="flex items-center gap-2 text-sm">
            <Hash className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Criado em:</span>
            <span>{new Date(contact.created_at).toLocaleDateString('pt-BR')}</span>
          </div>

          {/* Notes */}
          {contact.notes && (
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">Notas:</p>
              <p className="text-sm">{contact.notes}</p>
            </div>
          )}

          {/* Ad source */}
          {contact.ad_source_url && (
            <div className="p-3 bg-blue-500/10 rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">Origem do anúncio:</p>
              <a 
                href={contact.ad_source_url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-sm text-blue-500 hover:underline truncate block"
              >
                {contact.ad_source_url}
              </a>
            </div>
          )}

          {/* Tags management */}
          <div>
            <p className="text-sm text-muted-foreground mb-2">Etiquetas:</p>
            <div className="flex flex-wrap gap-2">
              {allTags.map(tag => {
                const isActive = contact.tags.includes(tag);
                const color = getTagColor(tag, customTags);
                return (
                  <Badge
                    key={tag}
                    className={cn(
                      "cursor-pointer transition-all",
                      isActive ? "text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                    style={isActive ? { backgroundColor: color } : {}}
                    onClick={() => handleToggleTag(tag)}
                  >
                    {tag}
                    {isActive && <X className="h-3 w-3 ml-1" />}
                  </Badge>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button 
            className="w-full" 
            onClick={() => {
              onOpenChange(false);
              onNavigateToChat(contact.id);
            }}
          >
            <MessageSquare className="h-4 w-4 mr-2" />
            Abrir Conversa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default function InboxKanbanPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { effectiveUserId } = useEffectiveUser();
  useActivityTracker('page_visit', 'Automati-Zap Kanban');

  const [contacts, setContacts] = useState<KanbanContact[]>([]);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [customTags, setCustomTags] = useState<InboxTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedContact, setSelectedContact] = useState<KanbanContact | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  // Create tag modal
  const [createTagModalOpen, setCreateTagModalOpen] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3b82f6');
  const [creatingTag, setCreatingTag] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const userId = effectiveUserId || user?.id;

  // Fetch data
  const fetchData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);

    try {
      const [contactsRes, instancesRes, tagsRes] = await Promise.all([
        supabase
          .from('inbox_contacts')
          .select('id, name, phone, profile_pic_url, tags, instance_id, last_message_at, unread_count, notes, ad_source_url, created_at')
          .eq('user_id', userId)
          .eq('status', 'active')
          .order('last_message_at', { ascending: false }),
        supabase
          .from('maturador_instances')
          .select('id, instance_name, phone_number, label')
          .eq('user_id', userId),
        supabase
          .from('inbox_tags')
          .select('*')
          .eq('user_id', userId),
      ]);

      if (contactsRes.data) {
        setContacts(contactsRes.data.map(c => ({
          ...c,
          tags: Array.isArray(c.tags) ? c.tags as string[] : [],
        })));
      }
      if (instancesRes.data) setInstances(instancesRes.data);
      if (tagsRes.data) setCustomTags(tagsRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // All available tags (predefined + custom)
  const allTags = useMemo(() => {
    const predefinedNames = predefinedLabels.map(l => l.name);
    const customNames = customTags.map(t => t.name);
    // Also extract any tags from contacts that might not be in either list
    const contactTags = new Set<string>();
    contacts.forEach(c => c.tags.forEach(t => contactTags.add(t)));
    const combined = new Set([...predefinedNames, ...customNames, ...Array.from(contactTags)]);
    return Array.from(combined);
  }, [customTags, contacts]);

  // Filter contacts by search
  const filteredContacts = useMemo(() => {
    if (!searchQuery.trim()) return contacts;
    const query = searchQuery.toLowerCase();
    return contacts.filter(c => 
      c.name?.toLowerCase().includes(query) ||
      c.phone.includes(query) ||
      c.tags.some(t => t.toLowerCase().includes(query))
    );
  }, [contacts, searchQuery]);

  // Group contacts by their first tag (or "Sem etiqueta")
  const contactsByTag = useMemo(() => {
    const grouped: Record<string, KanbanContact[]> = {};
    
    // Initialize all tag columns
    allTags.forEach(tag => {
      grouped[tag] = [];
    });
    grouped['Sem etiqueta'] = [];

    // Assign contacts to their first tag column
    filteredContacts.forEach(contact => {
      if (contact.tags.length === 0) {
        grouped['Sem etiqueta'].push(contact);
      } else {
        // Place in the first tag's column
        const firstTag = contact.tags[0];
        if (!grouped[firstTag]) {
          grouped[firstTag] = [];
        }
        grouped[firstTag].push(contact);
      }
    });

    return grouped;
  }, [filteredContacts, allTags]);

  // Ordered columns (predefined first, then custom, then "Sem etiqueta" at the end)
  const orderedColumns = useMemo(() => {
    const predefinedNames = predefinedLabels.map(l => l.name);
    const customNames = customTags.map(t => t.name);
    const otherTags = allTags.filter(t => 
      !predefinedNames.includes(t) && !customNames.includes(t)
    );
    return [...predefinedNames, ...customNames, ...otherTags, 'Sem etiqueta'];
  }, [allTags, customTags]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    // Find which column the card was dropped into
    const activeContact = contacts.find(c => c.id === active.id);
    if (!activeContact) return;

    // Determine target column from the over element
    let targetTag: string | null = null;
    
    // Check if dropped on another card
    const overContact = contacts.find(c => c.id === over.id);
    if (overContact) {
      targetTag = overContact.tags[0] || 'Sem etiqueta';
    }

    if (!targetTag) return;

    // If dropping in the same column, do nothing
    const currentTag = activeContact.tags[0] || 'Sem etiqueta';
    if (currentTag === targetTag) return;

    // Update tags
    let newTags: string[];
    if (targetTag === 'Sem etiqueta') {
      newTags = [];
    } else {
      // Replace first tag with the target tag, keep other tags
      newTags = [targetTag, ...activeContact.tags.filter(t => t !== currentTag && t !== targetTag)];
    }

    await updateContactTags(activeContact.id, newTags);
  };

  const handleDragOver = (_event: DragOverEvent) => {
    // We could add visual feedback here
  };

  const updateContactTags = async (contactId: string, newTags: string[]) => {
    try {
      const { error } = await supabase
        .from('inbox_contacts')
        .update({ tags: newTags })
        .eq('id', contactId);

      if (error) throw error;

      // Update local state
      setContacts(prev => prev.map(c => 
        c.id === contactId ? { ...c, tags: newTags } : c
      ));

      // Update selected contact if it's the same
      if (selectedContact?.id === contactId) {
        setSelectedContact(prev => prev ? { ...prev, tags: newTags } : null);
      }

      toast.success('Lead movido com sucesso');
    } catch (error) {
      console.error('Error updating tags:', error);
      toast.error('Erro ao mover lead');
    }
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim() || !userId) return;

    // Check if tag already exists
    const exists = allTags.some(t => t.toLowerCase() === newTagName.trim().toLowerCase());
    if (exists) {
      toast.error('Essa etiqueta já existe');
      return;
    }

    setCreatingTag(true);
    try {
      const { data, error } = await supabase
        .from('inbox_tags')
        .insert({
          user_id: userId,
          name: newTagName.trim(),
          color: newTagColor,
        })
        .select()
        .single();

      if (error) throw error;

      setCustomTags(prev => [...prev, data]);
      setNewTagName('');
      setNewTagColor('#3b82f6');
      setCreateTagModalOpen(false);
      toast.success('Etiqueta criada com sucesso');
    } catch (error) {
      console.error('Error creating tag:', error);
      toast.error('Erro ao criar etiqueta');
    } finally {
      setCreatingTag(false);
    }
  };

  const handleNavigateToChat = (contactId: string) => {
    navigate(`/inbox/chat?contact=${contactId}`);
  };

  const activeContact = activeId ? contacts.find(c => c.id === activeId) : null;

  return (
    <SystemLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/inbox')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Pipeline de Leads</h1>
              <p className="text-sm text-muted-foreground">
                {contacts.length} leads · Arraste para mover entre colunas
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar leads..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button onClick={() => setCreateTagModalOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Etiqueta
            </Button>
          </div>
        </div>

        {/* Kanban board */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
          >
            <div className="flex gap-4 overflow-x-auto pb-4">
              {orderedColumns.map(tag => {
                const columnContacts = contactsByTag[tag] || [];
                const color = tag === 'Sem etiqueta' ? '#6b7280' : getTagColor(tag, customTags);
                
                return (
                  <KanbanColumn
                    key={tag}
                    tag={tag}
                    contacts={columnContacts}
                    instances={instances}
                    customTags={customTags}
                    color={color}
                    onCardClick={(contact) => {
                      setSelectedContact(contact);
                      setDetailModalOpen(true);
                    }}
                  />
                );
              })}
            </div>

            <DragOverlay>
              {activeContact && (
                <div className="bg-card border border-accent rounded-lg p-3 shadow-xl w-[280px] opacity-90">
                  <div className="flex items-center gap-3">
                    {activeContact.profile_pic_url ? (
                      <img 
                        src={activeContact.profile_pic_url} 
                        alt={activeContact.name || 'Contact'} 
                        className="w-10 h-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                        <User className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-sm">
                        {activeContact.name || formatPhoneDisplay(activeContact.phone)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatPhoneDisplay(activeContact.phone)}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        )}

        {/* Contact detail modal */}
        <ContactDetailModal
          contact={selectedContact}
          open={detailModalOpen}
          onOpenChange={setDetailModalOpen}
          instances={instances}
          customTags={customTags}
          allTags={allTags}
          onNavigateToChat={handleNavigateToChat}
          onTagChange={updateContactTags}
        />

        {/* Create tag modal */}
        <Dialog open={createTagModalOpen} onOpenChange={setCreateTagModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova Etiqueta</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Nome da etiqueta</label>
                <Input
                  placeholder="Ex: Interessado"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Cor</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={newTagColor}
                    onChange={(e) => setNewTagColor(e.target.value)}
                    className="w-12 h-10 rounded cursor-pointer border-0"
                  />
                  <Badge 
                    className="text-white" 
                    style={{ backgroundColor: newTagColor }}
                  >
                    {newTagName || 'Prévia'}
                  </Badge>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateTagModalOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCreateTag} disabled={!newTagName.trim() || creatingTag}>
                {creatingTag ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                Criar Etiqueta
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </SystemLayout>
  );
}
