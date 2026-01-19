import { SystemLayout } from "@/components/layout/SystemLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, ShoppingBag, Phone, Calendar, Loader2, Tag, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useEffectiveUser } from "@/hooks/useEffectiveUser";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect, useMemo } from "react";
import { format, subDays, startOfDay, endOfDay, parseISO } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { ptBR } from "date-fns/locale";
import { AnimatedTable, Column } from "@/components/ui/animated-table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface SaleLog {
  id: string;
  contact_phone: string;
  instance_id: string;
  created_at: string;
  fb_event_status?: string;
  fb_event_pixel_id?: string;
  fb_event_error?: string;
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
  const { effectiveUserId } = useEffectiveUser();

  const [salesLogs, setSalesLogs] = useState<SaleLog[]>([]);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState<string>("today");
  const [instanceFilter, setInstanceFilter] = useState<string>("all");

  useEffect(() => {
    const fetchData = async () => {
      const userId = effectiveUserId || user?.id;
      if (!userId) return;
      setLoading(true);

      try {
        // Fetch instances
        const { data: instancesData } = await supabase
          .from("maturador_instances")
          .select("id, instance_name, phone_number")
          .eq("user_id", userId);
        setInstances(instancesData || []);

        // Fetch sales logs (label_applied = true means it was a sale)
        const { data: logsData } = await (supabase
          .from("tag_whats_logs" as any)
          .select("id, contact_phone, instance_id, created_at, fb_event_status, fb_event_pixel_id, fb_event_error")
          .eq("user_id", userId)
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
  }, [user, effectiveUserId]);

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
      key: "fb_event_status",
      header: "Meta",
      sortable: true,
      render: (item) => {
        const status = item.fb_event_status || 'pending';
        
        if (status === 'sent') {
          return (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    <span className="text-emerald-500 text-xs">Enviado</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Evento enviado para pixel: {item.fb_event_pixel_id?.slice(-6) || 'N/A'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        } else if (status === 'failed') {
          return (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <div className="flex items-center gap-1.5">
                    <XCircle className="h-4 w-4 text-red-500" />
                    <span className="text-red-500 text-xs">Não Enviado</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-[300px]">
                  <p className="text-xs">{item.fb_event_error || 'Lead e pixel não coincidem'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        } else {
          return (
            <div className="flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground text-xs">Pendente</span>
            </div>
          );
        }
      },
    },
  ];


  return (
    <SystemLayout>
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

    </SystemLayout>
  );
};

export default TagWhatsSales;
