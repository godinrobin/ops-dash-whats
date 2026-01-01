import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ArrowLeft, Loader2, Send, ShieldCheck, User, AlertCircle, Plus, Pencil, Trash2, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminStatus } from "@/hooks/useAdminStatus";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatPhoneDisplay } from "@/utils/phoneFormatter";

interface Instance {
  id: string;
  instance_name: string;
  phone_number: string | null;
  label: string | null;
  status: string;
}

interface VerifiedContact {
  id: string;
  phone: string;
  name: string | null;
  profile_pic_url: string | null;
  last_fetched_at: string | null;
}

export default function MaturadorVerifiedContacts() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isAdmin } = useAdminStatus();
  const [instances, setInstances] = useState<Instance[]>([]);
  const [contacts, setContacts] = useState<VerifiedContact[]>([]);
  const [loading, setLoading] = useState(true);
  const hasFetchedRef = useRef(false);
  
  // Send message modal
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<VerifiedContact | null>(null);
  const [selectedInstanceIds, setSelectedInstanceIds] = useState<string[]>([]);
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);

  // Admin modals
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<VerifiedContact | null>(null);
  const [editPhone, setEditPhone] = useState("");
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<VerifiedContact | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Fetch instances
  const fetchInstances = async () => {
    if (!user) return [];

    try {
      const { data, error } = await supabase
        .from('maturador_instances')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'connected')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching instances:', error);
      return [];
    }
  };

  // Fetch verified contacts from database
  const fetchContacts = async () => {
    try {
      const { data, error } = await supabase
        .from('maturador_verified_contacts')
        .select('*')
        .order('phone');

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching contacts:', error);
      return [];
    }
  };

  // Trigger background fetch of contact info if needed
  const triggerContactInfoFetch = async (instancesData: Instance[], contactsData: VerifiedContact[]) => {
    // Check if any contacts haven't been fetched yet
    const unfetchedContacts = contactsData.filter(c => !c.last_fetched_at);
    
    if (unfetchedContacts.length === 0 || instancesData.length === 0) {
      return;
    }

    // Use the first connected instance to fetch contact info
    const instanceToUse = instancesData[0];
    
    console.log(`Fetching info for ${unfetchedContacts.length} contacts using instance ${instanceToUse.instance_name}`);
    
    try {
      await supabase.functions.invoke('maturador-evolution', {
        body: {
          action: 'fetch-verified-contacts',
          instanceName: instanceToUse.instance_name,
        },
      });

      // Refetch contacts after update
      const updatedContacts = await fetchContacts();
      setContacts(updatedContacts);
    } catch (error) {
      console.error('Error triggering contact fetch:', error);
    }
  };

  useEffect(() => {
    const init = async () => {
      const [instancesData, contactsData] = await Promise.all([
        fetchInstances(),
        fetchContacts(),
      ]);
      
      setInstances(instancesData);
      setContacts(contactsData);
      setLoading(false);

      // Trigger background fetch only once per session
      if (!hasFetchedRef.current && instancesData.length > 0) {
        hasFetchedRef.current = true;
        triggerContactInfoFetch(instancesData, contactsData);
      }
    };
    
    init();
  }, [user]);

  const openSendModal = (contact: VerifiedContact) => {
    setSelectedContact(contact);
    setSelectedInstanceIds([]);
    setMessageText("");
    setSendModalOpen(true);
  };

  const handleSendMessage = async () => {
    if (selectedInstanceIds.length === 0 || !messageText.trim() || !selectedContact) {
      toast.error('Selecione pelo menos um número e digite uma mensagem');
      return;
    }

    setSending(true);
    try {
      const selectedInstances = instances.filter(i => selectedInstanceIds.includes(i.id));
      if (selectedInstances.length === 0) throw new Error('Nenhuma instância encontrada');

      let successCount = 0;
      let errorCount = 0;

      for (const instance of selectedInstances) {
        try {
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
          successCount++;
        } catch (err) {
          console.error(`Error sending from ${instance.instance_name}:`, err);
          errorCount++;
        }
      }

      if (successCount > 0) {
        toast.success(`Mensagem enviada de ${successCount} número(s)!`);
      }
      if (errorCount > 0) {
        toast.error(`Falha ao enviar de ${errorCount} número(s)`);
      }
      
      setSendModalOpen(false);
      setMessageText("");
      setSelectedInstanceIds([]);
    } catch (error: any) {
      console.error('Error sending message:', error);
      toast.error(error.message || 'Erro ao enviar mensagem');
    } finally {
      setSending(false);
    }
  };

  // Admin functions
  const openCreateModal = () => {
    setEditingContact(null);
    setEditPhone("");
    setEditName("");
    setEditModalOpen(true);
  };

  const openEditModal = (contact: VerifiedContact) => {
    setEditingContact(contact);
    setEditPhone(contact.phone);
    setEditName(contact.name || "");
    setEditModalOpen(true);
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

    setSaving(true);
    try {
      let contactId: string;
      
      if (editingContact) {
        const { error } = await supabase
          .from('maturador_verified_contacts')
          .update({ 
            phone: cleanedPhone, 
            name: editName.trim() || null,
            last_fetched_at: null // Reset to allow re-fetch
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
      setEditModalOpen(false);
      const updatedContacts = await fetchContacts();
      setContacts(updatedContacts);
    } catch (error: any) {
      console.error('Error saving contact:', error);
      toast.error(error.message || 'Erro ao salvar contato');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteContact = async () => {
    if (!contactToDelete) return;

    setDeleting(true);
    try {
      const { error } = await supabase
        .from('maturador_verified_contacts')
        .delete()
        .eq('id', contactToDelete.id);

      if (error) throw error;
      
      toast.success('Contato removido');
      setDeleteDialogOpen(false);
      setContactToDelete(null);
      const updatedContacts = await fetchContacts();
      setContacts(updatedContacts);
    } catch (error: any) {
      console.error('Error deleting contact:', error);
      toast.error(error.message || 'Erro ao remover contato');
    } finally {
      setDeleting(false);
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
            <Button variant="ghost" size="icon" onClick={() => navigate('/maturador')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <ShieldCheck className="h-6 w-6 text-green-500" />
                Contatos Verificados
              </h1>
              <p className="text-muted-foreground">Contatos verificados pela Meta para aquecer seu número</p>
            </div>
          </div>
          {isAdmin && (
            <Button onClick={openCreateModal}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Contato
            </Button>
          )}
        </div>

        {/* Info Banner */}
        <Card className="mb-8 border-green-500/30 bg-green-500/5">
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
        {instances.length === 0 && (
          <Card className="mb-8 border-yellow-500/30 bg-yellow-500/5">
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
          {contacts.map((contact) => (
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
                    disabled={instances.length === 0}
                  >
                    <Send className="h-4 w-4 mr-2" />
                    Enviar
                  </Button>
                  {isAdmin && (
                    <>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => openEditModal(contact)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline"
                        className="text-destructive hover:text-destructive"
                        onClick={() => {
                          setContactToDelete(contact);
                          setDeleteDialogOpen(true);
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
                <Label>Selecione os números para enviar</Label>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-between">
                      <span className="truncate">
                        {selectedInstanceIds.length > 0
                          ? `${selectedInstanceIds.length} número(s) selecionado(s)`
                          : "Selecione os números"}
                      </span>
                      <ChevronDown className="h-4 w-4 opacity-70" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-2">
                    <div className="grid gap-1 max-h-56 overflow-y-auto">
                      {instances.map((instance) => {
                        const isSelected = selectedInstanceIds.includes(instance.id);
                        return (
                          <label
                            key={instance.id}
                            className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${
                              isSelected ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setSelectedInstanceIds((prev) => {
                                  if (checked) return prev.includes(instance.id) ? prev : [...prev, instance.id];
                                  return prev.filter((id) => id !== instance.id);
                                });
                              }}
                              className="h-4 w-4 accent-accent"
                            />
                            <span className="text-sm truncate">
                              {instance.label || instance.phone_number || instance.instance_name}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
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
              <Button onClick={handleSendMessage} disabled={sending || selectedInstanceIds.length === 0 || !messageText.trim()}>
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

        {/* Admin: Edit/Create Modal */}
        {isAdmin && (
          <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
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
                <Button variant="outline" onClick={() => setEditModalOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleSaveContact} disabled={saving || !editPhone.trim()}>
                  {saving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : null}
                  Salvar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* Admin: Delete Confirmation */}
        {isAdmin && (
          <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
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
                  disabled={deleting}
                >
                  {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Excluir'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
}
