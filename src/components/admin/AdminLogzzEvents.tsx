import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Trash2, RefreshCw, Search, Package, ShoppingCart, Truck, Phone, User, Copy, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { splashedToast as toast } from "@/hooks/useSplashedToast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface LogzzEvent {
  id: string;
  user_id: string;
  event_type: string;
  customer_name: string | null;
  customer_phone: string | null;
  product_name: string | null;
  order_id: string | null;
  checkout_url: string | null;
  raw_payload: unknown;
  created_at: string;
  user_email?: string;
}
export function AdminLogzzEvents() {
  const [events, setEvents] = useState<LogzzEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<LogzzEvent | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("logzz_webhook_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) throw error;

      // Fetch user emails
      const userIds = [...new Set(data?.map((e) => e.user_id) || [])];
      let userEmailMap: Record<string, string> = {};

      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, username")
          .in("id", userIds);

        if (profiles) {
          userEmailMap = profiles.reduce((acc, p) => {
            acc[p.id] = p.username || p.id;
            return acc;
          }, {} as Record<string, string>);
        }
      }

      const eventsWithEmail = (data || []).map((e) => ({
        ...e,
        user_email: userEmailMap[e.user_id] || e.user_id,
      }));

      setEvents(eventsWithEmail);
    } catch (error) {
      console.error("Error fetching events:", error);
      toast.error("Erro ao carregar eventos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handleDelete = async () => {
    if (!eventToDelete) return;

    setDeleting(true);
    try {
      const { error } = await supabase
        .from("logzz_webhook_events")
        .delete()
        .eq("id", eventToDelete.id);

      if (error) throw error;

      setEvents((prev) => prev.filter((e) => e.id !== eventToDelete.id));
      toast.success("Evento deletado");
    } catch (error) {
      console.error("Error deleting event:", error);
      toast.error("Erro ao deletar evento");
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
      setEventToDelete(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copiado!");
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case "order":
        return <Package className="h-4 w-4" />;
      case "cart":
        return <ShoppingCart className="h-4 w-4" />;
      case "shipment":
        return <Truck className="h-4 w-4" />;
      default:
        return <Package className="h-4 w-4" />;
    }
  };

  const getEventBadgeVariant = (type: string) => {
    switch (type) {
      case "order":
        return "default";
      case "cart":
        return "secondary";
      case "shipment":
        return "outline";
      default:
        return "default";
    }
  };

  const filteredEvents = events.filter((e) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      e.customer_name?.toLowerCase().includes(searchLower) ||
      e.customer_phone?.includes(search) ||
      e.product_name?.toLowerCase().includes(searchLower) ||
      e.order_id?.toLowerCase().includes(searchLower) ||
      e.user_email?.toLowerCase().includes(searchLower) ||
      e.event_type.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, telefone, produto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button variant="outline" size="sm" onClick={fetchEvents} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      <div className="text-sm text-muted-foreground">
        {filteredEvents.length} eventos encontrados
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">Tipo</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead>Usuário</TableHead>
              <TableHead className="w-[150px]">Data</TableHead>
              <TableHead className="w-[80px]">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : filteredEvents.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Nenhum evento encontrado
                </TableCell>
              </TableRow>
            ) : (
              filteredEvents.map((event) => (
                <TableRow key={event.id}>
                  <TableCell>
                    <Badge variant={getEventBadgeVariant(event.event_type)} className="gap-1">
                      {getEventIcon(event.event_type)}
                      {event.event_type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="truncate max-w-[150px]">
                        {event.customer_name || "-"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {event.customer_phone ? (
                      <button
                        onClick={() => copyToClipboard(event.customer_phone!)}
                        className="flex items-center gap-1.5 hover:text-accent transition-colors"
                      >
                        <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-mono text-sm">{event.customer_phone}</span>
                        <Copy className="h-3 w-3 text-muted-foreground" />
                      </button>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="truncate max-w-[150px] block">
                      {event.product_name || "-"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground truncate max-w-[120px] block">
                      {event.user_email}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(event.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {event.checkout_url && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => window.open(event.checkout_url!, "_blank")}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => {
                          setEventToDelete(event);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deletar Evento</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja deletar este evento? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deletando..." : "Deletar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
