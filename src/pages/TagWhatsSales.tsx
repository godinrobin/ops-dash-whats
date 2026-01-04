import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, ShoppingBag, Phone, Calendar, Loader2, Tag, Download, CheckCircle2, XCircle, Send } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect, useMemo } from "react";
import { format, subDays, startOfDay, endOfDay, parseISO } from "date-fns";
import { toZonedTime, formatInTimeZone } from "date-fns-tz";
import { ptBR } from "date-fns/locale";
import { AnimatedTable, Column } from "@/components/ui/animated-table";
import { toast } from "sonner";

interface SaleLog {
  id: string;
  contact_phone: string;
  instance_id: string;
  created_at: string;
  extracted_value: number | null;
  conversion_sent: boolean;
  conversion_error: string | null;
  ctwa_clid: string | null;
}

interface Instance {
  id: string;
  instance_name: string;
  phone_number: string | null;
}

const SP_TIMEZONE = "America/Sao_Paulo";

const TagWhatsSales = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [salesLogs, setSalesLogs] = useState<SaleLog[]>([]);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState<string>("today");
  const [instanceFilter, setInstanceFilter] = useState<string>("all");

  // Manual send states
  const [sendingConversion, setSendingConversion] = useState<Record<string, boolean>>({});
  const [manualSendDialogOpen, setManualSendDialogOpen] = useState(false);
  const [selectedSale, setSelectedSale] = useState<SaleLog | null>(null);
  const [manualValue, setManualValue] = useState<string>("");
  const [sendingAllPending, setSendingAllPending] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      setLoading(true);

      try {
        // Fetch instances
        const { data: instancesData } = await supabase
          .from("maturador_instances")
          .select("id, instance_name, phone_number")
          .eq("user_id", user.id);
        setInstances(instancesData || []);

        // Fetch sales logs (label_applied = true means it was a sale)
        const { data: logsData } = await (supabase
          .from("tag_whats_logs" as any)
          .select("id, contact_phone, instance_id, created_at, extracted_value, conversion_sent, conversion_error, ctwa_clid")
          .eq("user_id", user.id)
          .eq("label_applied", true)
          .order("created_at", { ascending: false }) as any);

        setSalesLogs(logsData || []);
      } catch (error) {
        console.error("Error fetching sales data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user]);

  const getInstanceName = (instanceId: string) => {
    const instance = instances.find((i) => i.id === instanceId);
    return instance?.phone_number || instance?.instance_name || "Desconhecido";
  };

  const getDateRange = (filter: string) => {
    const now = toZonedTime(new Date(), SP_TIMEZONE);
    
    switch (filter) {
      case "today":
        return { start: startOfDay(now), end: endOfDay(now) };
      case "yesterday":
        const yesterday = subDays(now, 1);
        return { start: startOfDay(yesterday), end: endOfDay(yesterday) };
      case "7days":
        return { start: startOfDay(subDays(now, 6)), end: endOfDay(now) };
      default:
        return null;
    }
  };

  const filteredSales = useMemo(() => {
    let filtered = [...salesLogs];

    // Apply date filter
    const dateRange = getDateRange(dateFilter);
    if (dateRange) {
      filtered = filtered.filter((sale) => {
        const saleDate = toZonedTime(parseISO(sale.created_at), SP_TIMEZONE);
        return saleDate >= dateRange.start && saleDate <= dateRange.end;
      });
    }

    // Apply instance filter
    if (instanceFilter !== "all") {
      filtered = filtered.filter((sale) => sale.instance_id === instanceFilter);
    }

    return filtered;
  }, [salesLogs, dateFilter, instanceFilter]);

  const pendingSales = useMemo(() => {
    return filteredSales.filter((sale) => !sale.conversion_sent);
  }, [filteredSales]);

  const handleOpenManualSend = (sale: SaleLog) => {
    setSelectedSale(sale);
    setManualValue(sale.extracted_value?.toString() || "");
    setManualSendDialogOpen(true);
  };

  const handleManualSend = async () => {
    if (!selectedSale) return;

    const saleId = selectedSale.id;
    setSendingConversion((prev) => ({ ...prev, [saleId]: true }));
    setManualSendDialogOpen(false);

    try {
      const value = manualValue ? parseFloat(manualValue.replace(",", ".")) : undefined;

      const { data, error } = await supabase.functions.invoke("tag-whats-manual-conversion", {
        body: { saleLogId: saleId, value },
      });

      if (error) throw error;

      if (data.success) {
        toast.success("Conversão enviada com sucesso!", {
          description: `Pixel: ${data.pixel_id} | Valor: R$ ${data.value?.toFixed(2) || "0.00"}`,
        });

        // Update the local state
        setSalesLogs((prev) =>
          prev.map((sale) =>
            sale.id === saleId
              ? { ...sale, conversion_sent: true, conversion_error: null, extracted_value: value ?? sale.extracted_value }
              : sale
          )
        );
      } else {
        throw new Error(data.error || "Erro desconhecido");
      }
    } catch (error: any) {
      console.error("Error sending manual conversion:", error);
      toast.error("Erro ao enviar conversão", {
        description: error.message || "Tente novamente mais tarde",
      });
    } finally {
      setSendingConversion((prev) => ({ ...prev, [saleId]: false }));
      setSelectedSale(null);
      setManualValue("");
    }
  };

  const handleSendAllPending = async () => {
    if (pendingSales.length === 0) return;

    setSendingAllPending(true);
    let successCount = 0;
    let errorCount = 0;

    for (const sale of pendingSales) {
      try {
        const { data, error } = await supabase.functions.invoke("tag-whats-manual-conversion", {
          body: { saleLogId: sale.id, value: sale.extracted_value },
        });

        if (error) throw error;

        if (data.success) {
          successCount++;
          setSalesLogs((prev) =>
            prev.map((s) =>
              s.id === sale.id
                ? { ...s, conversion_sent: true, conversion_error: null }
                : s
            )
          );
        } else {
          errorCount++;
        }
      } catch (error) {
        console.error("Error sending conversion for sale:", sale.id, error);
        errorCount++;
      }
    }

    setSendingAllPending(false);

    if (successCount > 0) {
      toast.success(`${successCount} conversão(ões) enviada(s) com sucesso!`);
    }
    if (errorCount > 0) {
      toast.error(`${errorCount} conversão(ões) falharam`);
    }
  };

  const columns: Column<SaleLog>[] = [
    {
      key: "contact_phone",
      header: "Número do Comprador",
      sortable: true,
      render: (item) => (
        <div className="flex items-center gap-2">
          <Phone className="h-4 w-4 text-emerald-500" />
          <span className="font-mono">{item.contact_phone}</span>
        </div>
      ),
    },
    {
      key: "created_at",
      header: "Data do Pagamento",
      sortable: true,
      render: (item) => {
        const date = toZonedTime(parseISO(item.created_at), SP_TIMEZONE);
        return (
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-blue-500" />
            <span>{format(date, "dd/MM/yyyy HH:mm", { locale: ptBR })}</span>
          </div>
        );
      },
    },
    {
      key: "instance_id",
      header: "Instância Fonte",
      sortable: true,
      render: (item) => (
        <Badge variant="outline" className="font-normal">
          {getInstanceName(item.instance_id)}
        </Badge>
      ),
    },
    {
      key: "conversion_sent",
      header: "Meta",
      render: (item) => (
        item.conversion_sent ? (
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <span className="text-emerald-500 font-medium text-sm">Enviado</span>
          </div>
        ) : (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 cursor-help">
                  <XCircle className="h-4 w-4 text-red-500" />
                  <span className="text-red-500 font-medium text-sm">Não enviado</span>
                </div>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="text-sm">
                  {item.conversion_error || "Conversão não configurada ou desabilitada"}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )
      ),
    },
    {
      key: "manual_send",
      header: "Envio Manual",
      render: (item) => {
        if (item.conversion_sent) {
          return (
            <span className="text-muted-foreground text-sm">—</span>
          );
        }

        const isSending = sendingConversion[item.id];

        return (
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleOpenManualSend(item)}
            disabled={isSending}
            className="h-8 px-3"
          >
            {isSending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <>
                <Send className="h-3.5 w-3.5 mr-1.5" />
                Enviar
              </>
            )}
          </Button>
        );
      },
    },
  ];

  const getFilterLabel = () => {
    switch (dateFilter) {
      case "today":
        return "Hoje";
      case "yesterday":
        return "Ontem";
      case "7days":
        return "Últimos 7 dias";
      default:
        return "Todos";
    }
  };

  return (
    <>
      <Header />
      <div className="h-14 md:h-16" />
      <div className="min-h-screen bg-background p-6 md:p-10">
        <div className="container mx-auto max-w-6xl">
          <Button
            variant="ghost"
            onClick={() => navigate("/tag-whats/cloud")}
            className="mb-6"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar para Tag Whats Cloud
          </Button>

          <header className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-amber-500/20 rounded-full">
                <ShoppingBag className="h-6 w-6 text-amber-500" />
              </div>
              <h1 className="text-2xl md:text-3xl font-bold">Vendas Marcadas</h1>
              <Badge className="bg-emerald-500/20 text-emerald-400">
                {filteredSales.length} venda{filteredSales.length !== 1 ? "s" : ""}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              Números marcados com a etiqueta "Pago" pelo Tag Whats Cloud
            </p>
          </header>

          {/* Filters */}
          <Card className="mb-6 border-muted">
            <CardContent className="p-4">
              <div className="flex flex-wrap gap-4 items-center">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <Select value={dateFilter} onValueChange={setDateFilter}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue placeholder="Período" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="today">Hoje</SelectItem>
                      <SelectItem value="yesterday">Ontem</SelectItem>
                      <SelectItem value="7days">Últimos 7 dias</SelectItem>
                      <SelectItem value="all">Todos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4 text-muted-foreground" />
                  <Select value={instanceFilter} onValueChange={setInstanceFilter}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Instância" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as instâncias</SelectItem>
                      {instances.map((instance) => (
                        <SelectItem key={instance.id} value={instance.id}>
                          {instance.phone_number || instance.instance_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex-1" />

                {pendingSales.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSendAllPending}
                    disabled={sendingAllPending}
                    className="border-amber-500/50 text-amber-500 hover:bg-amber-500/10"
                  >
                    {sendingAllPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        Enviar Todas Pendentes ({pendingSales.length})
                      </>
                    )}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Sales Table */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <AnimatedTable
              data={filteredSales}
              columns={columns}
              keyExtractor={(item) => item.id}
              emptyMessage="Nenhuma venda encontrada para o período selecionado"
              enableAnimations={true}
              showExport={true}
              exportFileName="vendas-tag-whats"
              itemsPerPage={15}
            />
          )}

          <footer className="mt-16 text-center text-xs text-muted-foreground/50">
            Criado por{" "}
            <a
              href="https://instagram.com/joaolucassps"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-muted-foreground transition-colors"
            >
              @joaolucassps
            </a>
          </footer>
        </div>
      </div>

      {/* Manual Send Dialog */}
      <Dialog open={manualSendDialogOpen} onOpenChange={setManualSendDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Enviar Conversão Manualmente</DialogTitle>
            <DialogDescription>
              Envie o evento de compra para o pixel do Facebook. O valor é opcional.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="contact">Contato</Label>
              <Input
                id="contact"
                value={selectedSale?.contact_phone || ""}
                disabled
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="value">Valor da Compra (R$)</Label>
              <Input
                id="value"
                type="text"
                placeholder="Ex: 97,00"
                value={manualValue}
                onChange={(e) => setManualValue(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Deixe em branco para enviar sem valor
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualSendDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleManualSend}>
              <Send className="h-4 w-4 mr-2" />
              Enviar Conversão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default TagWhatsSales;
