import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Send, Check, Package, X, Trash2, Copy, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useActivityTracker } from "@/hooks/useActivityTracker";

interface ChargeItem {
  name: string;
  price: number;
  quantity: number;
}

interface Charge {
  id: string;
  charge_code: string;
  recipient_phone: string;
  recipient_name: string | null;
  items: ChargeItem[];
  total_amount: number;
  status: string;
  pix_qr_code: string | null;
  pix_copy_paste: string | null;
  notes: string | null;
  sent_at: string | null;
  paid_at: string | null;
  delivered_at: string | null;
  created_at: string;
  instance_id: string | null;
  maturador_instances?: {
    instance_name: string;
    phone_number: string | null;
  } | null;
}

interface Instance {
  id: string;
  instance_name: string;
  phone_number: string | null;
  status: string;
}

const WhatsAppCharges = () => {
  useActivityTracker("page_view", "WhatsApp Charges");
  const navigate = useNavigate();
  const { toast } = useToast();

  const [charges, setCharges] = useState<Charge[]>([]);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  
  // Modal states
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedCharge, setSelectedCharge] = useState<Charge | null>(null);

  // Form states
  const [selectedInstance, setSelectedInstance] = useState<string>("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [notes, setNotes] = useState("");
  const [generatePix, setGeneratePix] = useState(false);
  const [items, setItems] = useState<ChargeItem[]>([{ name: "", price: 0, quantity: 1 }]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, [filterStatus]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load instances
      const { data: instancesData } = await supabase
        .from("maturador_instances")
        .select("id, instance_name, phone_number, status")
        .eq("status", "connected");
      
      setInstances(instancesData || []);

      // Load charges via edge function
      const { data, error } = await supabase.functions.invoke("whatsapp-charge", {
        body: { action: "list-charges", status: filterStatus },
      });

      if (error) throw error;
      setCharges(data.charges || []);
    } catch (error: any) {
      console.error("Load error:", error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar os dados",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const addItem = () => {
    setItems([...items, { name: "", price: 0, quantity: 1 }]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const updateItem = (index: number, field: keyof ChargeItem, value: string | number) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const calculateTotal = () => {
    return items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const handleCreateCharge = async () => {
    if (!recipientPhone.trim()) {
      toast({ title: "Erro", description: "Informe o telefone do destinatário", variant: "destructive" });
      return;
    }

    const validItems = items.filter(i => i.name.trim() && i.price > 0);
    if (validItems.length === 0) {
      toast({ title: "Erro", description: "Adicione pelo menos um item válido", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-charge", {
        body: {
          action: "create-charge",
          instance_id: selectedInstance || null,
          recipient_phone: recipientPhone,
          recipient_name: recipientName || null,
          items: validItems,
          notes: notes || null,
          generate_pix: generatePix,
        },
      });

      if (error) throw error;

      toast({ title: "Sucesso", description: "Cobrança criada com sucesso!" });
      setCreateModalOpen(false);
      resetForm();
      loadData();
    } catch (error: any) {
      console.error("Create charge error:", error);
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendCharge = async (chargeId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-charge", {
        body: { action: "send-charge", charge_id: chargeId },
      });

      if (error) throw error;

      toast({ title: "Sucesso", description: "Cobrança enviada por WhatsApp!" });
      loadData();
    } catch (error: any) {
      console.error("Send charge error:", error);
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  };

  const handleUpdateStatus = async (chargeId: string, status: string, notify = true) => {
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-charge", {
        body: { action: "update-status", charge_id: chargeId, status, notify_customer: notify },
      });

      if (error) throw error;

      toast({ title: "Sucesso", description: "Status atualizado!" });
      loadData();
      setDetailsModalOpen(false);
    } catch (error: any) {
      console.error("Update status error:", error);
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  };

  const handleDeleteCharge = async (chargeId: string) => {
    if (!confirm("Tem certeza que deseja excluir esta cobrança?")) return;

    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-charge", {
        body: { action: "delete-charge", charge_id: chargeId },
      });

      if (error) throw error;

      toast({ title: "Sucesso", description: "Cobrança excluída!" });
      loadData();
      setDetailsModalOpen(false);
    } catch (error: any) {
      console.error("Delete charge error:", error);
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copiado!", description: "Código copiado para a área de transferência" });
  };

  const resetForm = () => {
    setSelectedInstance("");
    setRecipientPhone("");
    setRecipientName("");
    setNotes("");
    setGeneratePix(false);
    setItems([{ name: "", price: 0, quantity: 1 }]);
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      pending: { label: "Pendente", variant: "secondary" },
      paid: { label: "Pago", variant: "default" },
      delivered: { label: "Entregue", variant: "outline" },
      cancelled: { label: "Cancelado", variant: "destructive" },
    };
    const config = statusConfig[status] || statusConfig.pending;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="container mx-auto max-w-6xl">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">💳 Cobranças via WhatsApp</h1>
            <p className="text-muted-foreground">Crie e envie cobranças profissionais pelo WhatsApp</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-3 mb-6">
          <Button onClick={() => setCreateModalOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Nova Cobrança
          </Button>
          <Button variant="outline" onClick={loadData} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>

        {/* Filters */}
        <Tabs value={filterStatus} onValueChange={setFilterStatus} className="mb-6">
          <TabsList>
            <TabsTrigger value="all">Todas</TabsTrigger>
            <TabsTrigger value="pending">Pendentes</TabsTrigger>
            <TabsTrigger value="paid">Pagas</TabsTrigger>
            <TabsTrigger value="delivered">Entregues</TabsTrigger>
            <TabsTrigger value="cancelled">Canceladas</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Charges List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : charges.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <p className="text-muted-foreground mb-4">Nenhuma cobrança encontrada</p>
              <Button onClick={() => setCreateModalOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Criar Primeira Cobrança
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {charges.map((charge) => (
              <Card
                key={charge.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => {
                  setSelectedCharge(charge);
                  setDetailsModalOpen(true);
                }}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-mono">{charge.charge_code}</CardTitle>
                    {getStatusBadge(charge.status)}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <p className="font-semibold text-lg">{formatCurrency(charge.total_amount)}</p>
                    <p className="text-sm text-muted-foreground">
                      {charge.recipient_name || charge.recipient_phone}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(charge.created_at)}
                    </p>
                    <div className="flex gap-2 mt-3">
                      {!charge.sent_at && charge.instance_id && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSendCharge(charge.id);
                          }}
                        >
                          <Send className="w-3 h-3 mr-1" />
                          Enviar
                        </Button>
                      )}
                      {charge.status === "pending" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUpdateStatus(charge.id, "paid");
                          }}
                        >
                          <Check className="w-3 h-3 mr-1" />
                          Pago
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Create Charge Modal */}
        <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Nova Cobrança</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              {/* Instance Selection */}
              <div>
                <Label>Instância WhatsApp (opcional)</Label>
                <Select value={selectedInstance} onValueChange={setSelectedInstance}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione para enviar automaticamente" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Nenhuma (apenas criar)</SelectItem>
                    {instances.map((inst) => (
                      <SelectItem key={inst.id} value={inst.id}>
                        {inst.instance_name} {inst.phone_number && `(${inst.phone_number})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Recipient */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Telefone *</Label>
                  <Input
                    placeholder="11999999999"
                    value={recipientPhone}
                    onChange={(e) => setRecipientPhone(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Nome</Label>
                  <Input
                    placeholder="Nome do cliente"
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                  />
                </div>
              </div>

              {/* Items */}
              <div>
                <Label className="mb-2 block">Itens da Cobrança *</Label>
                <div className="space-y-3">
                  {items.map((item, index) => (
                    <div key={index} className="flex gap-2 items-end">
                      <div className="flex-1">
                        <Input
                          placeholder="Nome do item"
                          value={item.name}
                          onChange={(e) => updateItem(index, "name", e.target.value)}
                        />
                      </div>
                      <div className="w-24">
                        <Input
                          type="number"
                          placeholder="Preço"
                          min="0"
                          step="0.01"
                          value={item.price || ""}
                          onChange={(e) => updateItem(index, "price", parseFloat(e.target.value) || 0)}
                        />
                      </div>
                      <div className="w-16">
                        <Input
                          type="number"
                          placeholder="Qtd"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateItem(index, "quantity", parseInt(e.target.value) || 1)}
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeItem(index)}
                        disabled={items.length === 1}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button variant="outline" size="sm" className="mt-2" onClick={addItem}>
                  <Plus className="w-3 h-3 mr-1" />
                  Adicionar Item
                </Button>
              </div>

              {/* Total */}
              <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
                <span className="font-medium">Total:</span>
                <span className="text-lg font-bold">{formatCurrency(calculateTotal())}</span>
              </div>

              {/* PIX Option */}
              <div className="flex items-center justify-between">
                <div>
                  <Label>Gerar PIX automático</Label>
                  <p className="text-xs text-muted-foreground">Gera QR Code e código copia e cola</p>
                </div>
                <Switch checked={generatePix} onCheckedChange={setGeneratePix} />
              </div>

              {/* Notes */}
              <div>
                <Label>Observações</Label>
                <Textarea
                  placeholder="Observações internas (não enviadas ao cliente)"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateModalOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCreateCharge} disabled={submitting}>
                {submitting ? "Criando..." : "Criar Cobrança"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Charge Details Modal */}
        <Dialog open={detailsModalOpen} onOpenChange={setDetailsModalOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                Cobrança #{selectedCharge?.charge_code}
                {selectedCharge && getStatusBadge(selectedCharge.status)}
              </DialogTitle>
            </DialogHeader>
            
            {selectedCharge && (
              <div className="space-y-4">
                {/* Recipient Info */}
                <div className="p-3 bg-muted rounded-lg">
                  <p className="font-medium">{selectedCharge.recipient_name || "Cliente"}</p>
                  <p className="text-sm text-muted-foreground">{selectedCharge.recipient_phone}</p>
                </div>

                {/* Items */}
                <div>
                  <Label className="mb-2 block">Itens</Label>
                  <div className="space-y-2">
                    {selectedCharge.items.map((item, index) => (
                      <div key={index} className="flex justify-between text-sm">
                        <span>{item.name} (x{item.quantity})</span>
                        <span>{formatCurrency(item.price * item.quantity)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between font-bold border-t pt-2">
                      <span>Total</span>
                      <span>{formatCurrency(selectedCharge.total_amount)}</span>
                    </div>
                  </div>
                </div>

                {/* PIX Info */}
                {selectedCharge.pix_copy_paste && (
                  <div>
                    <Label className="mb-2 block">PIX Copia e Cola</Label>
                    <div className="flex gap-2">
                      <Input value={selectedCharge.pix_copy_paste} readOnly className="text-xs" />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => copyToClipboard(selectedCharge.pix_copy_paste!)}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}

                {/* Timestamps */}
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>Criado: {formatDate(selectedCharge.created_at)}</p>
                  {selectedCharge.sent_at && <p>Enviado: {formatDate(selectedCharge.sent_at)}</p>}
                  {selectedCharge.paid_at && <p>Pago: {formatDate(selectedCharge.paid_at)}</p>}
                  {selectedCharge.delivered_at && <p>Entregue: {formatDate(selectedCharge.delivered_at)}</p>}
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-2">
                  {!selectedCharge.sent_at && selectedCharge.instance_id && (
                    <Button onClick={() => handleSendCharge(selectedCharge.id)}>
                      <Send className="w-4 h-4 mr-2" />
                      Enviar WhatsApp
                    </Button>
                  )}
                  
                  {selectedCharge.status === "pending" && (
                    <Button variant="secondary" onClick={() => handleUpdateStatus(selectedCharge.id, "paid")}>
                      <Check className="w-4 h-4 mr-2" />
                      Marcar Pago
                    </Button>
                  )}
                  
                  {selectedCharge.status === "paid" && (
                    <Button variant="secondary" onClick={() => handleUpdateStatus(selectedCharge.id, "delivered")}>
                      <Package className="w-4 h-4 mr-2" />
                      Marcar Entregue
                    </Button>
                  )}
                  
                  {selectedCharge.status !== "cancelled" && (
                    <Button variant="outline" onClick={() => handleUpdateStatus(selectedCharge.id, "cancelled")}>
                      <X className="w-4 h-4 mr-2" />
                      Cancelar
                    </Button>
                  )}
                  
                  <Button variant="destructive" onClick={() => handleDeleteCharge(selectedCharge.id)}>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Excluir
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default WhatsAppCharges;
