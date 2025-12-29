import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  MessageSquare, 
  Plus, 
  Search, 
  Phone,
  User,
  Calendar,
  DollarSign,
  Send,
  ExternalLink,
  RefreshCcw,
  Info,
  Check,
  Loader2,
  AlertTriangle,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { splashedToast } from "@/hooks/useSplashedToast";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Lead {
  id: string;
  phone: string;
  name?: string;
  profile_pic_url?: string;
  fbclid?: string;
  ctwa_clid?: string;
  ad_id?: string;
  campaign_id?: string;
  first_message?: string;
  first_contact_at: string;
  purchase_sent_at?: string;
  purchase_value?: number;
  whatsapp_number_id?: string;
}

interface WhatsAppNumber {
  id: string;
  phone_number: string;
  label?: string;
  is_active: boolean;
  instance_id?: string;
}

interface IngestLog {
  id: string;
  created_at: string;
  reason: string;
  phone_prefix?: string;
  remote_jid?: string;
  phone_source?: string;
  ctwa_source?: string;
  payload_hash?: string;
  event_type: string;
}

export default function AdsTracker() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [whatsappNumbers, setWhatsappNumbers] = useState<WhatsAppNumber[]>([]);
  const [instances, setInstances] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedNumber, setSelectedNumber] = useState<string>("all");
  const [addNumberDialogOpen, setAddNumberDialogOpen] = useState(false);
  const [purchaseDialogOpen, setPurchaseDialogOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [purchaseValue, setPurchaseValue] = useState("");
  const [sendingPurchase, setSendingPurchase] = useState(false);
  const [newNumber, setNewNumber] = useState({ phone: "", label: "", instance_id: "" });
  const [ingestLogs, setIngestLogs] = useState<IngestLog[]>([]);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [loadingLogs, setLoadingLogs] = useState(false);

  useEffect(() => {
    if (user) {
      loadData();
      subscribeToLeads();
    }
  }, [user, selectedNumber]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Load instances
      const { data: instancesData } = await supabase
        .from("maturador_instances")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "connected");

      setInstances(instancesData || []);

      // Load WhatsApp numbers
      const { data: numbersData } = await supabase
        .from("ads_whatsapp_numbers")
        .select("*")
        .eq("user_id", user.id);

      setWhatsappNumbers(numbersData || []);

      // Load leads
      let query = supabase
        .from("ads_whatsapp_leads")
        .select("*")
        .eq("user_id", user.id)
        .order("first_contact_at", { ascending: false });

      if (selectedNumber !== "all") {
        query = query.eq("whatsapp_number_id", selectedNumber);
      }

      const { data: leadsData } = await query;
      setLeads(leadsData || []);
    } catch (error) {
      console.error("Error loading tracker data:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadIngestLogs = async () => {
    if (!user) return;
    setLoadingLogs(true);
    try {
      const { data } = await supabase
        .from("ads_lead_ingest_logs")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      
      setIngestLogs((data as IngestLog[]) || []);
    } catch (error) {
      console.error("Error loading ingest logs:", error);
    } finally {
      setLoadingLogs(false);
    }
  };

  const handleToggleDiagnostics = () => {
    const newValue = !showDiagnostics;
    setShowDiagnostics(newValue);
    if (newValue && ingestLogs.length === 0) {
      loadIngestLogs();
    }
  };

  const subscribeToLeads = () => {
    const channel = supabase
      .channel("ads-leads")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "ads_whatsapp_leads",
          filter: `user_id=eq.${user?.id}`
        },
        (payload) => {
          setLeads(prev => [payload.new as Lead, ...prev]);
          splashedToast.success("Novo lead capturado!");
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const handleAddNumber = async () => {
    if (!user || !newNumber.phone || !newNumber.instance_id) {
      splashedToast.error("Preencha todos os campos obrigatórios");
      return;
    }

    try {
      const { error } = await supabase
        .from("ads_whatsapp_numbers")
        .insert({
          user_id: user.id,
          phone_number: newNumber.phone.replace(/\D/g, ""),
          label: newNumber.label || null,
          instance_id: newNumber.instance_id
        });

      if (error) throw error;

      setAddNumberDialogOpen(false);
      setNewNumber({ phone: "", label: "", instance_id: "" });
      splashedToast.success("Número adicionado!");
      await loadData();
    } catch (error: any) {
      console.error("Error adding number:", error);
      splashedToast.error(error.message?.includes("duplicate") ? "Número já cadastrado" : "Erro ao adicionar");
    }
  };

  const handleSendPurchase = async () => {
    if (!selectedLead || !purchaseValue) {
      splashedToast.error("Informe o valor da compra");
      return;
    }

    setSendingPurchase(true);
    try {
      const { error } = await supabase.functions.invoke("facebook-conversions", {
        body: {
          leadId: selectedLead.id,
          eventName: "Purchase",
          value: parseFloat(purchaseValue),
          currency: "BRL"
        }
      });

      if (error) throw error;

      // Update local state
      setLeads(prev => prev.map(l => 
        l.id === selectedLead.id 
          ? { ...l, purchase_sent_at: new Date().toISOString(), purchase_value: parseFloat(purchaseValue) }
          : l
      ));

      setPurchaseDialogOpen(false);
      setPurchaseValue("");
      setSelectedLead(null);
      splashedToast.success("Evento de compra enviado ao Facebook!");
    } catch (error) {
      console.error("Error sending purchase:", error);
      splashedToast.error("Erro ao enviar evento");
    } finally {
      setSendingPurchase(false);
    }
  };

  const filteredLeads = leads.filter(lead =>
    lead.phone.includes(searchQuery) || 
    lead.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Tracker WhatsApp</h1>
          <p className="text-muted-foreground">Rastreie leads e envie eventos de compra</p>
        </div>

        <Dialog open={addNumberDialogOpen} onOpenChange={setAddNumberDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Adicionar Número
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar Número para Rastrear</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Instância WhatsApp</Label>
                <Select 
                  value={newNumber.instance_id} 
                  onValueChange={(v) => setNewNumber(prev => ({ ...prev, instance_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma instância" />
                  </SelectTrigger>
                  <SelectContent>
                    {instances.map(inst => (
                      <SelectItem key={inst.id} value={inst.id}>
                        {inst.instance_name} {inst.phone_number && `(${inst.phone_number})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Número de WhatsApp</Label>
                <Input
                  value={newNumber.phone}
                  onChange={(e) => setNewNumber(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="5511999999999"
                />
              </div>
              <div className="space-y-2">
                <Label>Apelido (opcional)</Label>
                <Input
                  value={newNumber.label}
                  onChange={(e) => setNewNumber(prev => ({ ...prev, label: e.target.value }))}
                  placeholder="WhatsApp Vendas"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddNumberDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleAddNumber}>
                Adicionar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Info Alert */}
      <Alert className="bg-blue-500/10 border-blue-500/50">
        <Info className="h-4 w-4" />
        <AlertDescription>
          <strong>Importante:</strong> Para o tracker funcionar, sua campanha deve enviar o lead diretamente para o WhatsApp, 
          sem presell. O ctwa_clid é capturado automaticamente quando o contato inicia a conversa.
        </AlertDescription>
      </Alert>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por telefone ou nome..."
            className="pl-10"
          />
        </div>
        
        <Select value={selectedNumber} onValueChange={setSelectedNumber}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Todos os números" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os números</SelectItem>
            {whatsappNumbers.map((num) => (
              <SelectItem key={num.id} value={num.id}>
                {num.label || num.phone_number}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-card/50">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{leads.length}</p>
            <p className="text-xs text-muted-foreground">Total Leads</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-400">
              {leads.filter(l => l.purchase_sent_at).length}
            </p>
            <p className="text-xs text-muted-foreground">Compras Enviadas</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-400">
              {leads.filter(l => l.ctwa_clid).length}
            </p>
            <p className="text-xs text-muted-foreground">Com CTWA ID</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-purple-400">
              R$ {leads.reduce((sum, l) => sum + (l.purchase_value || 0), 0).toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground">Total Vendas</p>
          </CardContent>
        </Card>
      </div>

      {/* Diagnostics Panel */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader className="py-3 cursor-pointer" onClick={handleToggleDiagnostics}>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              Diagnóstico de Captura
              {ingestLogs.length > 0 && (
                <Badge variant="outline" className="ml-2 text-yellow-500 border-yellow-500/50">
                  {ingestLogs.length} eventos
                </Badge>
              )}
            </CardTitle>
            <Button variant="ghost" size="sm">
              {showDiagnostics ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </CardHeader>
        
        {showDiagnostics && (
          <CardContent className="pt-0">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-muted-foreground">
                Eventos de skip/erro na captura de leads (últimos 50)
              </p>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={loadIngestLogs}
                disabled={loadingLogs}
              >
                {loadingLogs ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCcw className="h-3 w-3" />}
              </Button>
            </div>
            
            {loadingLogs ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : ingestLogs.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <Check className="h-8 w-8 mx-auto mb-2 text-green-500" />
                <p className="text-sm">Nenhum erro de captura registrado</p>
                <p className="text-xs mt-1">Todos os leads estão sendo capturados corretamente</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {ingestLogs.map((log) => (
                  <div 
                    key={log.id} 
                    className="p-3 rounded-lg bg-muted/30 border border-border/50 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className={cn(
                            "text-[10px]",
                            log.event_type === 'error' ? "text-red-400 border-red-400/50" : "text-yellow-400 border-yellow-400/50"
                          )}>
                            {log.event_type === 'error' ? 'ERRO' : 'SKIP'}
                          </Badge>
                          <span className="font-medium text-foreground truncate">{log.reason}</span>
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
                          {log.phone_prefix && <span>Prefixo: {log.phone_prefix}</span>}
                          {log.phone_source && <span>Fonte: {log.phone_source}</span>}
                          {log.ctwa_source && <span>CTWA: {log.ctwa_source}</span>}
                        </div>
                        {log.remote_jid && (
                          <p className="text-muted-foreground mt-1 truncate">JID: {log.remote_jid}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-muted-foreground">
                          {formatDistanceToNow(new Date(log.created_at), { addSuffix: true, locale: ptBR })}
                        </p>
                        {log.payload_hash && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-6 px-2 text-[10px]"
                            onClick={() => {
                              navigator.clipboard.writeText(log.payload_hash || '');
                              splashedToast.success("Hash copiado!");
                            }}
                          >
                            #{log.payload_hash.substring(0, 8)}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Leads List */}
      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))
        ) : filteredLeads.length === 0 ? (
          <Card className="bg-card/50">
            <CardContent className="py-12 text-center">
              <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Nenhum lead capturado ainda</p>
              <p className="text-sm text-muted-foreground mt-2">
                Os leads aparecerão aqui quando alguém iniciar uma conversa
              </p>
            </CardContent>
          </Card>
        ) : (
          <AnimatePresence>
            {filteredLeads.map((lead, index) => (
              <motion.div
                key={lead.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ delay: index * 0.02 }}
              >
                <Card className={cn(
                  "bg-card/50 backdrop-blur border-border/50",
                  lead.purchase_sent_at && "border-l-4 border-l-green-500"
                )}>
                  <CardContent className="p-4">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      {/* Lead Info */}
                      <div className="flex items-center gap-3 flex-1">
                        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                          {lead.profile_pic_url ? (
                            <img src={lead.profile_pic_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <User className="h-6 w-6 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium truncate">
                              {lead.name || lead.phone}
                            </h3>
                            {lead.ctwa_clid && (
                              <Badge className="bg-blue-500/20 text-blue-400 text-xs">
                                CTWA
                              </Badge>
                            )}
                            {lead.purchase_sent_at && (
                              <Badge className="bg-green-500/20 text-green-400 text-xs">
                                <Check className="h-3 w-3 mr-1" />
                                Compra Enviada
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {lead.phone}
                          </p>
                          {lead.first_message && (
                            <p className="text-xs text-muted-foreground mt-1 truncate">
                              "{lead.first_message}"
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Meta & Actions */}
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                            <Calendar className="h-3 w-3" />
                            {formatDistanceToNow(new Date(lead.first_contact_at), { 
                              addSuffix: true, 
                              locale: ptBR 
                            })}
                          </p>
                          {lead.purchase_value && (
                            <p className="text-sm font-medium text-green-400 flex items-center gap-1 justify-end">
                              <DollarSign className="h-3 w-3" />
                              R$ {lead.purchase_value.toFixed(2)}
                            </p>
                          )}
                        </div>

                        {!lead.purchase_sent_at && lead.ctwa_clid && (
                          <Button
                            size="sm"
                            onClick={() => {
                              setSelectedLead(lead);
                              setPurchaseDialogOpen(true);
                            }}
                          >
                            <Send className="h-4 w-4 mr-1" />
                            Enviar Compra
                          </Button>
                        )}

                        {!lead.ctwa_clid && (
                          <Badge variant="outline" className="text-xs">
                            Sem CTWA ID
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Purchase Dialog */}
      <Dialog open={purchaseDialogOpen} onOpenChange={setPurchaseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar Evento de Compra</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            {selectedLead && (
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-sm">
                  <strong>Lead:</strong> {selectedLead.name || selectedLead.phone}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  CTWA ID: {selectedLead.ctwa_clid}
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label>Valor da Compra (R$)</Label>
              <Input
                type="number"
                value={purchaseValue}
                onChange={(e) => setPurchaseValue(e.target.value)}
                placeholder="297.00"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Este evento será enviado para a API de Conversões do Facebook usando o ctwa_clid do lead.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPurchaseDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSendPurchase} disabled={sendingPurchase}>
              {sendingPurchase ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Enviar Evento
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
