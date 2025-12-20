import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Loader2, Send, ShieldCheck, User, AlertCircle, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface Instance {
  id: string;
  instance_name: string;
  phone_number: string | null;
  label: string | null;
  status: string;
}

interface VerifiedContact {
  phone: string;
  name: string | null;
  profilePic: string | null;
  loading: boolean;
}

// Lista de contatos verificados pela Meta
const VERIFIED_PHONE_NUMBERS = [
  "551128326088",
  "551140044828",
  "551123575200",
  "5511943763874",
  "5521995027179",
  "5511999910621",
  "554141414141",
  "5511999151515",
  "5511941042222",
  "5511974529842",
  "5511997177777",
  "5511964874908",
  "5511976731540",
  "551140049090",
  "556140040001",
  "553130034070",
  "551140027007",
];

// Formata número para exibição
const formatPhoneDisplay = (phone: string) => {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 13) {
    // 55 11 9XXXX-XXXX
    return `+${cleaned.slice(0,2)} (${cleaned.slice(2,4)}) ${cleaned.slice(4,9)}-${cleaned.slice(9)}`;
  } else if (cleaned.length === 12) {
    // 55 11 XXXX-XXXX
    return `+${cleaned.slice(0,2)} (${cleaned.slice(2,4)}) ${cleaned.slice(4,8)}-${cleaned.slice(8)}`;
  }
  return phone;
};

export default function MaturadorVerifiedContacts() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [instances, setInstances] = useState<Instance[]>([]);
  const [contacts, setContacts] = useState<VerifiedContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingContacts, setLoadingContacts] = useState(false);
  
  // Send message modal
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<VerifiedContact | null>(null);
  const [selectedInstanceId, setSelectedInstanceId] = useState("");
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);

  // Fetch instances
  const fetchInstances = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('maturador_instances')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'connected')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setInstances(data || []);
    } catch (error) {
      console.error('Error fetching instances:', error);
      toast.error('Erro ao carregar instâncias');
    }
  };

  // Initialize contacts list
  const initializeContacts = () => {
    const initialContacts = VERIFIED_PHONE_NUMBERS.map(phone => ({
      phone,
      name: null,
      profilePic: null,
      loading: false,
    }));
    setContacts(initialContacts);
  };

  // Fetch contact info via Evolution API
  const fetchContactInfo = async (phone: string, instanceName: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('maturador-evolution', {
        body: {
          action: 'get-contact-info',
          instanceName,
          phone,
        },
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching contact info:', error);
      return null;
    }
  };

  // Load all contact info
  const loadAllContactsInfo = async () => {
    if (instances.length === 0) {
      toast.error('Você precisa de pelo menos uma instância conectada');
      return;
    }

    setLoadingContacts(true);
    const instanceToUse = instances[0];

    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];
      
      // Update loading state
      setContacts(prev => prev.map((c, idx) => 
        idx === i ? { ...c, loading: true } : c
      ));

      const info = await fetchContactInfo(contact.phone, instanceToUse.instance_name);

      // Update contact with info
      setContacts(prev => prev.map((c, idx) => 
        idx === i ? {
          ...c,
          name: info?.name || null,
          profilePic: info?.profilePic || null,
          loading: false,
        } : c
      ));

      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    setLoadingContacts(false);
    toast.success('Informações dos contatos carregadas');
  };

  useEffect(() => {
    initializeContacts();
  }, []);

  useEffect(() => {
    const init = async () => {
      await fetchInstances();
      setLoading(false);
    };
    init();
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
          {instances.length > 0 && (
            <Button onClick={loadAllContactsInfo} disabled={loadingContacts}>
              {loadingContacts ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Carregar Fotos e Nomes
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
            <Card key={contact.phone} className="hover:border-primary/50 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12">
                    {contact.profilePic ? (
                      <AvatarImage src={contact.profilePic} alt={contact.name || 'Contato'} />
                    ) : null}
                    <AvatarFallback className="bg-green-500/10 text-green-500">
                      {contact.loading ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <User className="h-5 w-5" />
                      )}
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
                <Button 
                  className="w-full mt-3" 
                  size="sm"
                  onClick={() => openSendModal(contact)}
                  disabled={instances.length === 0}
                >
                  <Send className="h-4 w-4 mr-2" />
                  Enviar Mensagem
                </Button>
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
                <Label>Selecione o número para enviar</Label>
                <Select value={selectedInstanceId} onValueChange={setSelectedInstanceId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um número" />
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
      </div>
    </div>
  );
}
