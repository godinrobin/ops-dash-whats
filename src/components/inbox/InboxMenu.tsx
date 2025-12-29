import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useInboxFlows } from '@/hooks/useInboxFlows';
import { Smartphone, Zap, Tag, Users, Trash2, Plus, X, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { formatPhoneDisplay } from '@/utils/phoneFormatter';

interface Instance {
  id: string;
  instance_name: string;
  label: string | null;
  phone_number: string | null;
  status: string;
}

interface InboxMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const predefinedLabels = [
  { name: 'Pago', color: 'bg-green-500' },
  { name: 'Pendente', color: 'bg-yellow-500' },
  { name: 'Lead', color: 'bg-blue-500' },
  { name: 'VIP', color: 'bg-purple-500' },
  { name: 'Suporte', color: 'bg-orange-500' },
];

const getLabelColor = (labelName: string): string => {
  const found = predefinedLabels.find(l => l.name.toLowerCase() === labelName.toLowerCase());
  return found?.color || 'bg-gray-500';
};

export const InboxMenu = ({ open, onOpenChange }: InboxMenuProps) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { flows, updateFlow } = useInboxFlows();
  const [instances, setInstances] = useState<Instance[]>([]);
  const [customLabels, setCustomLabels] = useState<string[]>([]);
  const [labeledContacts, setLabeledContacts] = useState<{ id: string; name: string | null; phone: string; tags: string[] }[]>([]);
  const [newLabelName, setNewLabelName] = useState('');
  const [loading, setLoading] = useState(true);
  const [reprocessing, setReprocessing] = useState(false);

  useEffect(() => {
    if (!user || !open) return;
    fetchData();
  }, [user, open]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);

    // Fetch instances
    const { data: instancesData } = await supabase
      .from('maturador_instances')
      .select('id, instance_name, label, phone_number, status')
      .eq('user_id', user.id);

    if (instancesData) {
      setInstances(instancesData);
    }

    // Fetch contacts with labels
    const { data: contactsData } = await supabase
      .from('inbox_contacts')
      .select('id, name, phone, tags')
      .eq('user_id', user.id);

    if (contactsData) {
      const labeled = contactsData
        .filter(c => {
          const tags = Array.isArray(c.tags) ? c.tags : [];
          return tags.length > 0;
        })
        .map(c => ({
          id: c.id,
          name: c.name,
          phone: c.phone,
          tags: Array.isArray(c.tags) ? (c.tags as string[]) : [],
        }));
      setLabeledContacts(labeled);

      // Extract custom labels (not in predefined list)
      const allTags = new Set<string>();
      contactsData.forEach(c => {
        const tags = Array.isArray(c.tags) ? c.tags : [];
        tags.forEach((t: string) => allTags.add(t));
      });
      const predefinedNames = predefinedLabels.map(l => l.name.toLowerCase());
      const custom = Array.from(allTags).filter(t => !predefinedNames.includes(t.toLowerCase()));
      setCustomLabels(custom);
    }

    setLoading(false);
  };

  const getFlowsForInstance = (instanceId: string) => {
    return flows.filter(f => f.assigned_instances?.includes(instanceId));
  };

  const handleRemoveLabelFromContact = async (contactId: string, labelName: string) => {
    const contact = labeledContacts.find(c => c.id === contactId);
    if (!contact) return;

    const newTags = contact.tags.filter(t => t !== labelName);
    
    const { error } = await supabase
      .from('inbox_contacts')
      .update({ tags: newTags })
      .eq('id', contactId);

    if (error) {
      toast.error('Erro ao remover etiqueta');
      return;
    }

    setLabeledContacts(prev => 
      prev.map(c => c.id === contactId ? { ...c, tags: newTags } : c)
        .filter(c => c.tags.length > 0)
    );
    toast.success('Etiqueta removida');
  };

  const handleAddCustomLabel = () => {
    if (!newLabelName.trim()) return;
    if (customLabels.includes(newLabelName.trim()) || 
        predefinedLabels.some(l => l.name.toLowerCase() === newLabelName.trim().toLowerCase())) {
      toast.error('Essa etiqueta já existe');
      return;
    }
    setCustomLabels(prev => [...prev, newLabelName.trim()]);
    setNewLabelName('');
    toast.success('Etiqueta criada');
  };

  const handleRemoveCustomLabel = async (labelName: string) => {
    // Remove from all contacts
    const contactsWithLabel = labeledContacts.filter(c => c.tags.includes(labelName));
    
    for (const contact of contactsWithLabel) {
      const newTags = contact.tags.filter(t => t !== labelName);
      await supabase
        .from('inbox_contacts')
        .update({ tags: newTags })
        .eq('id', contact.id);
    }

    setCustomLabels(prev => prev.filter(l => l !== labelName));
    setLabeledContacts(prev => 
      prev.map(c => ({ ...c, tags: c.tags.filter(t => t !== labelName) }))
        .filter(c => c.tags.length > 0)
    );
    toast.success('Etiqueta removida de todos os contatos');
  };

  const handleReprocessContacts = async () => {
    setReprocessing(true);
    try {
      const { data, error } = await supabase.functions.invoke('reprocess-inbox-contacts', {
        body: {},
      });

      if (error) {
        console.error('Error reprocessing contacts:', error);
        toast.error('Erro ao reprocessar contatos');
        return;
      }

      toast.success(`Reprocessado: ${data.phonesNormalized} telefones normalizados, ${data.namesCleaned} nomes corrigidos`);
      
      // Refresh data
      await fetchData();
    } catch (err) {
      console.error('Error reprocessing contacts:', err);
      toast.error('Erro ao reprocessar contatos');
    } finally {
      setReprocessing(false);
    }
  };

  const allLabels = [...predefinedLabels.map(l => l.name), ...customLabels];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[400px] sm:w-[540px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            Menu do Inbox
          </SheetTitle>
        </SheetHeader>

        <Tabs defaultValue="numbers" className="mt-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="numbers" className="flex items-center gap-1">
              <Smartphone className="h-4 w-4" />
              Números
            </TabsTrigger>
            <TabsTrigger value="labels" className="flex items-center gap-1">
              <Tag className="h-4 w-4" />
              Etiquetas
            </TabsTrigger>
            <TabsTrigger value="contacts" className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              Etiquetados
            </TabsTrigger>
          </TabsList>

          <TabsContent value="numbers" className="mt-4">
            <ScrollArea className="h-[calc(100vh-200px)]">
              {loading ? (
                <p className="text-muted-foreground text-sm">Carregando...</p>
              ) : instances.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Smartphone className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>Nenhum número conectado</p>
                  <Button 
                    variant="link" 
                    onClick={() => { onOpenChange(false); navigate('/maturador/instances'); }}
                  >
                    Conectar no Maturador
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {instances.map(instance => {
                    const assignedFlows = getFlowsForInstance(instance.id);
                    return (
                      <div 
                        key={instance.id} 
                        className="p-3 rounded-lg border border-border bg-card"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className={cn(
                              "w-2 h-2 rounded-full",
                              instance.status === 'connected' || instance.status === 'open' 
                                ? 'bg-green-500' 
                                : 'bg-red-500'
                            )} />
                            <span className="font-medium">
                              {instance.label || instance.instance_name}
                            </span>
                          </div>
                          <Badge variant="outline" className="text-xs">
                            {instance.status === 'connected' || instance.status === 'open' ? 'Conectado' : 'Desconectado'}
                          </Badge>
                        </div>
                        {instance.phone_number && (
                          <p className="text-sm text-muted-foreground mb-2">
                            {instance.phone_number}
                          </p>
                        )}
                        
                        <div className="mt-2">
                          <p className="text-xs text-muted-foreground mb-1">Fluxos atribuídos:</p>
                          {assignedFlows.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {assignedFlows.map(flow => (
                                <Badge 
                                  key={flow.id} 
                                  variant="secondary" 
                                  className="text-xs flex items-center gap-1"
                                >
                                  <Zap className="h-3 w-3" />
                                  {flow.name}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground italic">
                              Nenhum fluxo atribuído
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="labels" className="mt-4">
            <ScrollArea className="h-[calc(100vh-200px)]">
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium mb-2">Etiquetas Padrão</h4>
                  <div className="flex flex-wrap gap-2">
                    {predefinedLabels.map(label => (
                      <Badge 
                        key={label.name}
                        className={cn("text-white", label.color)}
                      >
                        {label.name}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-medium mb-2">Etiquetas Personalizadas</h4>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {customLabels.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nenhuma etiqueta personalizada</p>
                    ) : (
                      customLabels.map(label => (
                        <Badge 
                          key={label}
                          variant="secondary"
                          className="flex items-center gap-1"
                        >
                          {label}
                          <button 
                            onClick={() => handleRemoveCustomLabel(label)}
                            className="hover:bg-destructive/20 rounded-full p-0.5"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Input 
                      placeholder="Nova etiqueta..."
                      value={newLabelName}
                      onChange={(e) => setNewLabelName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddCustomLabel()}
                    />
                    <Button size="icon" onClick={handleAddCustomLabel}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="contacts" className="mt-4">
            <ScrollArea className="h-[calc(100vh-200px)]">
              {labeledContacts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Tag className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>Nenhum contato etiquetado</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {labeledContacts.map(contact => (
                    <div 
                      key={contact.id}
                      className="p-3 rounded-lg border border-border bg-card"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm">
                            {contact.name || formatPhoneDisplay(contact.phone)}
                          </p>
                          {contact.name && (
                            <p className="text-xs text-muted-foreground">{formatPhoneDisplay(contact.phone)}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {contact.tags.map(tag => (
                          <Badge 
                            key={tag}
                            className={cn(
                              "text-white text-xs flex items-center gap-1",
                              getLabelColor(tag)
                            )}
                          >
                            {tag}
                            <button 
                              onClick={() => handleRemoveLabelFromContact(contact.id, tag)}
                              className="hover:bg-white/20 rounded-full p-0.5"
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <div className="absolute bottom-4 left-4 right-4 space-y-2">
          <Button 
            variant="secondary" 
            className="w-full"
            onClick={handleReprocessContacts}
            disabled={reprocessing}
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", reprocessing && "animate-spin")} />
            {reprocessing ? 'Reprocessando...' : 'Reprocessar Contatos'}
          </Button>
          <Button 
            variant="outline" 
            className="w-full"
            onClick={() => {
              onOpenChange(false);
              navigate('/inbox/flows');
            }}
          >
            <Zap className="h-4 w-4 mr-2" />
            Gerenciar Fluxos
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};
