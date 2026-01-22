import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { SystemLayout } from '@/components/layout/SystemLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import { ArrowLeft, Plus, Phone, User, Tag, Hash, GripVertical, Search, X, MessageSquare, Loader2, Eye, EyeOff, Columns, ChevronLeft, ChevronRight, StickyNote, Edit3, Check, RefreshCw, Calendar } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useEffectiveUser } from '@/hooks/useEffectiveUser';
import { useActivityTracker } from '@/hooks/useActivityTracker';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatPhoneDisplay } from '@/utils/phoneFormatter';

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
  arrayMove,
  horizontalListSortingStrategy,
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

const CONTACTS_PAGE_SIZE = 1000;
const CONTACTS_MAX_TOTAL = 50000;

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
        // Let the ScrollArea reserve space for the scrollbar; the card can stay full width.
        "bg-card border border-border rounded-lg p-2.5 cursor-pointer hover:border-accent transition-all group w-full max-w-full",
        isDragging && "shadow-lg ring-2 ring-accent"
      )}
      onClick={onClick}
    >
      <div className="flex items-start gap-2">
        {/* Drag handle */}
        <div 
          {...attributes} 
          {...listeners}
          className="mt-1 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
        </div>

        {/* Profile pic */}
        <div className="flex-shrink-0">
          {contact.profile_pic_url ? (
            <img 
              src={contact.profile_pic_url} 
              alt={contact.name || 'Contact'} 
              className="w-8 h-8 rounded-full object-cover"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
              <User className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
        </div>

        {/* Contact info */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <p className="font-medium text-xs truncate">
            {contact.name || formatPhoneDisplay(contact.phone)}
          </p>
          <p className="text-[10px] text-muted-foreground truncate">
            {formatPhoneDisplay(contact.phone)}
          </p>
          
          {/* Tags */}
          {contact.tags.length > 0 && (
            <div className="flex flex-wrap gap-0.5 mt-1">
              {contact.tags.slice(0, 2).map(tag => (
                <Badge 
                  key={tag}
                  className="text-[8px] px-1 py-0 text-white leading-tight"
                  style={{ backgroundColor: getTagColor(tag, customTags) }}
                >
                  {tag}
                </Badge>
              ))}
              {contact.tags.length > 2 && (
                <Badge variant="secondary" className="text-[8px] px-1 py-0 leading-tight">
                  +{contact.tags.length - 2}
                </Badge>
              )}
            </div>
          )}

          {/* Instance number */}
          <div className="flex items-center gap-1 mt-1 text-[10px]">
            <Phone className="h-2.5 w-2.5 flex-shrink-0 text-muted-foreground" />
            <span className="truncate text-accent">{formatPhoneDisplay(instanceLabel)}</span>
          </div>
        </div>

        {/* Unread badge */}
        {contact.unread_count > 0 && (
          <Badge className="bg-positive text-accent-foreground text-[10px] px-1.5 py-0 flex-shrink-0">
            {contact.unread_count}
          </Badge>
        )}
      </div>
    </div>
  );
};

// Sortable Column component
const SortableKanbanColumn = ({ 
  tag, 
  contacts, 
  instances, 
  customTags, 
  color,
  onCardClick,
  onToggleVisibility,
}: {
  tag: string;
  contacts: KanbanContact[];
  instances: Instance[];
  customTags: InboxTag[];
  color: string;
  onCardClick: (contact: KanbanContact) => void;
  onToggleVisibility: (tag: string) => void;
}) => {
  const isLocked = tag === 'Sem etiqueta';
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `column-${tag}`, disabled: isLocked });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        // IMPORTANT: keep overflow visible so card borders/shadows never get clipped.
        "flex-shrink-0 w-[300px] min-w-[300px] max-w-[300px] bg-muted/30 rounded-lg border border-border",
        isDragging && "ring-2 ring-accent"
      )}
    >
      {/* Column header */}
      <div 
        className="p-2 border-b border-border flex items-center justify-between gap-1"
        style={{ borderTopColor: color, borderTopWidth: 3, borderTopLeftRadius: 8, borderTopRightRadius: 8 }}
      >
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <div 
            {...(!isLocked ? attributes : {})}
            {...(!isLocked ? listeners : {})}
            className={cn(
              "select-none",
              isLocked ? "cursor-not-allowed opacity-60" : "cursor-grab active:cursor-grabbing"
            )}
          >
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div 
            className="w-2.5 h-2.5 rounded-full flex-shrink-0" 
            style={{ backgroundColor: color }} 
          />
          <h3 className="font-semibold text-xs truncate">{tag}</h3>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Badge variant="secondary" className="text-[10px] px-1.5">
            {contacts.length}
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            disabled={isLocked}
            onClick={(e) => {
              e.stopPropagation();
              if (isLocked) return;
              onToggleVisibility(tag);
            }}
          >
            <EyeOff className="h-3 w-3 text-muted-foreground" />
          </Button>
        </div>
      </div>

      {/* Column content */}
      <ScrollArea className="h-[calc(100vh-280px)]" orientation="vertical" withScrollbarPadding>
        <div className="px-2 py-1.5 space-y-1.5 overflow-x-hidden">
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
            <div className="text-center py-6 text-muted-foreground text-xs">
              <Tag className="h-6 w-6 mx-auto mb-1.5 opacity-50" />
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
  onNotesChange,
}: {
  contact: KanbanContact | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instances: Instance[];
  customTags: InboxTag[];
  allTags: string[];
  onNavigateToChat: (contactId: string) => void;
  onTagChange: (contactId: string, newTags: string[]) => void;
  onNotesChange: (contactId: string, notes: string) => void;
}) => {
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  // Sync notes value when contact changes or modal opens
  useEffect(() => {
    if (contact) {
      setNotesValue(contact.notes || '');
      setIsEditingNotes(false);
    }
  }, [contact?.id, open]);

  if (!contact) return null;

  const instance = instances.find(i => i.id === contact.instance_id);
  const instanceLabel = instance?.phone_number || instance?.label || instance?.instance_name || 'Sem número';

  const handleToggleTag = (tag: string) => {
    const newTags = contact.tags.includes(tag)
      ? contact.tags.filter(t => t !== tag)
      : [...contact.tags, tag];
    onTagChange(contact.id, newTags);
  };

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    try {
      await onNotesChange(contact.id, notesValue);
      setIsEditingNotes(false);
    } finally {
      setSavingNotes(false);
    }
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
            <span className="text-accent">{formatPhoneDisplay(instanceLabel)}</span>
          </div>

          {/* Created at */}
          <div className="flex items-center gap-2 text-sm">
            <Hash className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Criado em:</span>
            <span>{new Date(contact.created_at).toLocaleDateString('pt-BR')}</span>
          </div>

          {/* Notes - always visible */}
          <div className="p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <StickyNote className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Notas:</p>
              </div>
              {!isEditingNotes && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setIsEditingNotes(true)}
                >
                  <Edit3 className="h-3 w-3" />
                </Button>
              )}
            </div>
            
            {isEditingNotes ? (
              <div className="space-y-2">
                <Textarea
                  value={notesValue}
                  onChange={(e) => setNotesValue(e.target.value)}
                  placeholder="Adicione notas sobre este contato..."
                  className="min-h-[80px] text-sm resize-none"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleSaveNotes}
                    disabled={savingNotes}
                    className="flex-1"
                  >
                    {savingNotes ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <Check className="h-3 w-3 mr-1" />
                    )}
                    Salvar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setNotesValue(contact.notes || '');
                      setIsEditingNotes(false);
                    }}
                    disabled={savingNotes}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm whitespace-pre-wrap">
                {contact.notes || <span className="text-muted-foreground italic">Nenhuma nota adicionada</span>}
              </p>
            )}
          </div>

          {/* Ad source */}
          {contact.ad_source_url && (
            <div className="p-3 bg-accent/10 rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">Origem do anúncio:</p>
              <a 
                href={contact.ad_source_url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-sm text-accent hover:underline truncate block"
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

const STORAGE_KEY_HIDDEN_COLUMNS = 'kanban_hidden_columns';
const STORAGE_KEY_COLUMN_ORDER = 'kanban_column_order';

export default function InboxKanbanPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { effectiveUserId } = useEffectiveUser();
  useActivityTracker('page_visit', 'Automati-Zap Kanban');

  const [contacts, setContacts] = useState<KanbanContact[]>([]);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [customTags, setCustomTags] = useState<InboxTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedContact, setSelectedContact] = useState<KanbanContact | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  // Column visibility and order
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_HIDDEN_COLUMNS);
      const set = stored ? new Set<string>(JSON.parse(stored)) : new Set<string>();
      // Coluna fixa: nunca pode ser ocultada
      set.delete('Sem etiqueta');
      return set;
    } catch {
      return new Set();
    }
  });
  const [columnOrder, setColumnOrder] = useState<string[]>([]);

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

  // Save hidden columns to localStorage
  useEffect(() => {
    const safe = new Set(hiddenColumns);
    safe.delete('Sem etiqueta');
    localStorage.setItem(STORAGE_KEY_HIDDEN_COLUMNS, JSON.stringify(Array.from(safe)));
  }, [hiddenColumns]);

  // Fetch data with increased limit
  const fetchData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);

    try {
      // IMPORTANT: Some backends enforce a hard per-request cap (commonly 1000 rows).
      // To reliably load more than 1000 leads, we paginate in batches.
      const contactsPromise = (async () => {
        const all: any[] = [];
        let from = 0;

        while (from < CONTACTS_MAX_TOTAL) {
          const to = from + CONTACTS_PAGE_SIZE - 1;
          const res = await supabase
            .from('inbox_contacts')
            .select('id, name, phone, profile_pic_url, tags, instance_id, last_message_at, unread_count, notes, ad_source_url, created_at')
            .eq('user_id', userId)
            .eq('status', 'active')
            .order('last_message_at', { ascending: false })
            .range(from, to);

          if (res.error) throw res.error;

          const batch = res.data ?? [];
          all.push(...batch);

          if (batch.length < CONTACTS_PAGE_SIZE) break;
          from += CONTACTS_PAGE_SIZE;
        }

        return all as KanbanContact[];
      })();

      const [contactsData, instancesRes, tagsRes] = await Promise.all([
        contactsPromise,
        supabase
          .from('maturador_instances')
          .select('id, instance_name, phone_number, label')
          .eq('user_id', userId),
        supabase
          .from('inbox_tags')
          .select('*')
          .eq('user_id', userId),
      ]);

      setContacts(
        (contactsData ?? []).map((c: any) => ({
          ...c,
          tags: Array.isArray(c.tags) ? (c.tags as string[]) : [],
        }))
      );

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

  // All available tags (predefined + user's custom tags only)
  const allTags = useMemo(() => {
    const predefinedNames = predefinedLabels.map(l => l.name);
    const customNames = customTags.map(t => t.name);
    // Also extract any tags from contacts that might not be in either list
    const contactTags = new Set<string>();
    contacts.forEach(c => c.tags.forEach(t => contactTags.add(t)));
    const combined = new Set([...predefinedNames, ...customNames, ...Array.from(contactTags)]);
    return Array.from(combined);
  }, [customTags, contacts]);

  // Initialize column order when allTags changes
  useEffect(() => {
    const predefinedNames = predefinedLabels.map(l => l.name);
    const customNames = customTags.map(t => t.name);
    const otherTags = allTags.filter(t => 
      !predefinedNames.includes(t) && !customNames.includes(t) && t !== 'Sem etiqueta'
    );
    
    // Try to load saved order
    try {
      const stored = localStorage.getItem(STORAGE_KEY_COLUMN_ORDER);
      if (stored) {
        const savedOrder = JSON.parse(stored) as string[];
        // Merge saved order with current tags (keep order for existing, append new ones)
        const allCurrentTags = ['Sem etiqueta', ...predefinedNames, ...customNames, ...otherTags];
        const validSaved = savedOrder.filter(t => allCurrentTags.includes(t));
        const newTags = allCurrentTags.filter(t => !validSaved.includes(t));
        
        // Ensure "Sem etiqueta" is always first
        const finalOrder = validSaved.filter(t => t !== 'Sem etiqueta');
        setColumnOrder(['Sem etiqueta', ...finalOrder, ...newTags.filter(t => t !== 'Sem etiqueta')]);
        return;
      }
    } catch {
      // Ignore parse errors
    }
    
    // Default order: "Sem etiqueta" first, then predefined, then custom, then others
    setColumnOrder(['Sem etiqueta', ...predefinedNames, ...customNames, ...otherTags]);
  }, [allTags, customTags]);

  // Save column order to localStorage
  useEffect(() => {
    if (columnOrder.length > 0) {
      localStorage.setItem(STORAGE_KEY_COLUMN_ORDER, JSON.stringify(columnOrder));
    }
  }, [columnOrder]);

  // Filter contacts by search and date
  const filteredContacts = useMemo(() => {
    let filtered = contacts;
    
    // Apply date filter
    if (dateFilter !== 'all') {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      let startDate: Date;
      
      switch (dateFilter) {
        case 'today':
          startDate = today;
          break;
        case 'yesterday':
          startDate = new Date(today);
          startDate.setDate(startDate.getDate() - 1);
          const endOfYesterday = new Date(today);
          filtered = filtered.filter(c => {
            const createdAt = new Date(c.created_at);
            return createdAt >= startDate && createdAt < endOfYesterday;
          });
          break;
        case '7days':
          startDate = new Date(today);
          startDate.setDate(startDate.getDate() - 7);
          filtered = filtered.filter(c => new Date(c.created_at) >= startDate);
          break;
        case '30days':
          startDate = new Date(today);
          startDate.setDate(startDate.getDate() - 30);
          filtered = filtered.filter(c => new Date(c.created_at) >= startDate);
          break;
        default:
          break;
      }
      
      if (dateFilter === 'today') {
        filtered = filtered.filter(c => new Date(c.created_at) >= today);
      }
    }
    
    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(c => 
        c.name?.toLowerCase().includes(query) ||
        c.phone.includes(query) ||
        c.tags.some(t => t.toLowerCase().includes(query))
      );
    }
    
    return filtered;
  }, [contacts, searchQuery, dateFilter]);

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

  // Visible columns based on order and hidden state
  const visibleColumns = useMemo(() => {
    return columnOrder.filter(tag => tag === 'Sem etiqueta' || !hiddenColumns.has(tag));
  }, [columnOrder, hiddenColumns]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeIdStr = active.id as string;
    const overIdStr = over.id as string;

    // Check if it's a column being dragged
    if (activeIdStr.startsWith('column-') && overIdStr.startsWith('column-')) {
      const activeTag = activeIdStr.replace('column-', '');
      const overTag = overIdStr.replace('column-', '');
      
      if (activeTag !== overTag) {
        const oldIndex = columnOrder.indexOf(activeTag);
        const newIndex = columnOrder.indexOf(overTag);
        
        if (oldIndex !== -1 && newIndex !== -1) {
          // Don't allow moving anything before "Sem etiqueta" (index 0)
          const finalNewIndex = newIndex === 0 && activeTag !== 'Sem etiqueta' ? 1 : newIndex;
          const newOrder = arrayMove(columnOrder, oldIndex, finalNewIndex);
          
          // Ensure "Sem etiqueta" stays first
          const semEtiquetaIndex = newOrder.indexOf('Sem etiqueta');
          if (semEtiquetaIndex !== 0) {
            newOrder.splice(semEtiquetaIndex, 1);
            newOrder.unshift('Sem etiqueta');
          }
          
          setColumnOrder(newOrder);
          toast.success('Colunas reordenadas');
        }
      }
      return;
    }

    // Handle card drag
    const activeContact = contacts.find(c => c.id === activeIdStr);
    if (!activeContact) return;

    // Determine target column from the over element
    let targetTag: string | null = null;
    
    // Check if dropped on another card
    const overContact = contacts.find(c => c.id === overIdStr);
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

  const handleDragOver = () => {
    // We could add visual feedback here
  };

  const toggleColumnVisibility = (tag: string) => {
    if (tag === 'Sem etiqueta') return; // coluna fixa
    setHiddenColumns(prev => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }
      return next;
    });
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

  const updateContactNotes = async (contactId: string, notes: string) => {
    try {
      const { error } = await supabase
        .from('inbox_contacts')
        .update({ notes })
        .eq('id', contactId);

      if (error) throw error;

      // Update local state
      setContacts(prev => prev.map(c => 
        c.id === contactId ? { ...c, notes } : c
      ));

      // Update selected contact if it's the same
      if (selectedContact?.id === contactId) {
        setSelectedContact(prev => prev ? { ...prev, notes } : null);
      }

      toast.success('Notas salvas com sucesso');
    } catch (error) {
      console.error('Error updating notes:', error);
      toast.error('Erro ao salvar notas');
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

  const handleSyncTags = async () => {
    setSyncing(true);
    try {
      await fetchData();
      toast.success('Etiquetas sincronizadas com sucesso');
    } catch (error) {
      console.error('Error syncing:', error);
      toast.error('Erro ao sincronizar');
    } finally {
      setSyncing(false);
    }
  };

  const activeContact = activeId ? contacts.find(c => c.id === activeId) : null;
  const isColumnDrag = activeId?.startsWith('column-');

  return (
    <SystemLayout>
      <div className="space-y-4 h-full">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/inbox')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Pipeline de Leads</h1>
              <p className="text-sm text-muted-foreground">
                Organize seus leads em Kanban.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
            <div className="relative flex-1 sm:w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar leads..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Date filter */}
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="w-[140px]">
                <Calendar className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filtrar por data" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Sem filtro</SelectItem>
                <SelectItem value="today">Hoje</SelectItem>
                <SelectItem value="yesterday">Ontem</SelectItem>
                <SelectItem value="7days">Últimos 7 dias</SelectItem>
                <SelectItem value="30days">Últimos 30 dias</SelectItem>
              </SelectContent>
            </Select>

            {/* Sync button */}
            <Button 
              variant="outline" 
              size="icon" 
              onClick={handleSyncTags}
              disabled={syncing}
              title="Sincronizar etiquetas"
            >
              <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
            </Button>
            
            {/* Column visibility dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <Columns className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 max-h-80 overflow-y-auto">
                <DropdownMenuLabel>Colunas visíveis</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {columnOrder.map(tag => (
                  <DropdownMenuCheckboxItem
                    key={tag}
                    disabled={tag === 'Sem etiqueta'}
                    checked={tag === 'Sem etiqueta' ? true : !hiddenColumns.has(tag)}
                    onCheckedChange={() => {
                      if (tag === 'Sem etiqueta') return;
                      toggleColumnVisibility(tag);
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-2.5 h-2.5 rounded-full" 
                        style={{ backgroundColor: tag === 'Sem etiqueta' ? '#6b7280' : getTagColor(tag, customTags) }} 
                      />
                      <span className="truncate">{tag}</span>
                      <Badge variant="secondary" className="text-[10px] ml-auto">
                        {contactsByTag[tag]?.length || 0}
                      </Badge>
                    </div>
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button onClick={() => setCreateTagModalOpen(true)} size="sm">
              <Plus className="h-4 w-4 mr-1" />
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
            <div className="overflow-x-auto pb-4">
              <SortableContext 
                items={visibleColumns.map(tag => `column-${tag}`)} 
                strategy={horizontalListSortingStrategy}
              >
                <div className="flex gap-3 min-w-min">
                  {visibleColumns.map(tag => {
                    const columnContacts = contactsByTag[tag] || [];
                    const color = tag === 'Sem etiqueta' ? '#6b7280' : getTagColor(tag, customTags);
                    
                    return (
                      <SortableKanbanColumn
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
                        onToggleVisibility={toggleColumnVisibility}
                      />
                    );
                  })}
                </div>
              </SortableContext>
            </div>

            <DragOverlay>
              {isColumnDrag && activeId ? (
                <div className="w-[300px] bg-muted/50 rounded-lg border-2 border-accent p-4 shadow-xl">
                  <div className="text-center text-sm font-medium">
                    {activeId.replace('column-', '')}
                  </div>
                </div>
              ) : activeContact ? (
                <div className="bg-card border border-accent rounded-lg p-2.5 shadow-xl w-[280px] opacity-90">
                  <div className="flex items-center gap-2">
                    {activeContact.profile_pic_url ? (
                      <img 
                        src={activeContact.profile_pic_url} 
                        alt={activeContact.name || 'Contact'} 
                        className="w-8 h-8 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                        <User className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-medium text-xs truncate">
                        {activeContact.name || formatPhoneDisplay(activeContact.phone)}
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {formatPhoneDisplay(activeContact.phone)}
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}
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
          onNotesChange={updateContactNotes}
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
