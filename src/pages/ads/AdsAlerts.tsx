import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { 
  Bell, 
  Plus, 
  Phone, 
  AlertTriangle, 
  XCircle, 
  CreditCard,
  PhoneOff,
  Check,
  Trash2,
  Smartphone
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { splashedToast } from "@/hooks/useSplashedToast";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Alert {
  id: string;
  alert_type: string;
  title: string;
  message: string;
  ad_account_id?: string;
  campaign_id?: string;
  is_read: boolean;
  created_at: string;
}

interface AlertNumber {
  id: string;
  phone_number: string;
  label?: string;
  is_active: boolean;
}

interface WhatsAppNumber {
  id: string;
  phone_number: string;
  label?: string;
  is_active: boolean;
  instance_id?: string;
}

export default function AdsAlerts() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertNumbers, setAlertNumbers] = useState<AlertNumber[]>([]);
  const [whatsappNumbers, setWhatsappNumbers] = useState<WhatsAppNumber[]>([]);
  const [addNumberDialogOpen, setAddNumberDialogOpen] = useState(false);
  const [newNumber, setNewNumber] = useState({ phone: "", label: "" });

  useEffect(() => {
    if (user) {
      loadData();
      subscribeToAlerts();
    }
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Load alerts
      const { data: alertsData } = await supabase
        .from("ads_alerts")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      setAlerts(alertsData || []);

      // Load alert numbers
      const { data: numbersData } = await supabase
        .from("ads_alert_numbers")
        .select("*")
        .eq("user_id", user.id);

      setAlertNumbers(numbersData || []);

      // Load WhatsApp numbers (from ads_whatsapp_numbers)
      const { data: whatsappData } = await supabase
        .from("ads_whatsapp_numbers")
        .select("*")
        .eq("user_id", user.id);

      setWhatsappNumbers(whatsappData || []);
    } catch (error) {
      console.error("Error loading alerts data:", error);
    } finally {
      setLoading(false);
    }
  };

  const subscribeToAlerts = () => {
    const channel = supabase
      .channel("ads-alerts")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "ads_alerts",
          filter: `user_id=eq.${user?.id}`
        },
        (payload) => {
          setAlerts(prev => [payload.new as Alert, ...prev]);
          splashedToast.warning(payload.new.title);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const handleAddAlertNumber = async () => {
    if (!user || !newNumber.phone) return;

    try {
      const { error } = await supabase
        .from("ads_alert_numbers")
        .insert({
          user_id: user.id,
          phone_number: newNumber.phone.replace(/\D/g, ""),
          label: newNumber.label || null
        });

      if (error) throw error;

      setAddNumberDialogOpen(false);
      setNewNumber({ phone: "", label: "" });
      splashedToast.success("Número adicionado!");
      await loadData();
    } catch (error: any) {
      console.error("Error adding number:", error);
      splashedToast.error(error.message?.includes("duplicate") ? "Número já cadastrado" : "Erro ao adicionar");
    }
  };

  const handleRemoveAlertNumber = async (id: string) => {
    try {
      const { error } = await supabase
        .from("ads_alert_numbers")
        .delete()
        .eq("id", id);

      if (error) throw error;
      setAlertNumbers(prev => prev.filter(n => n.id !== id));
      splashedToast.success("Número removido");
    } catch (error) {
      console.error("Error removing number:", error);
      splashedToast.error("Erro ao remover número");
    }
  };

  const handleMarkAsRead = async (alertId: string) => {
    try {
      await supabase
        .from("ads_alerts")
        .update({ is_read: true })
        .eq("id", alertId);

      setAlerts(prev => prev.map(a => 
        a.id === alertId ? { ...a, is_read: true } : a
      ));
    } catch (error) {
      console.error("Error marking as read:", error);
    }
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case "ad_rejected":
        return <XCircle className="h-5 w-5 text-red-400" />;
      case "account_restricted":
        return <AlertTriangle className="h-5 w-5 text-orange-400" />;
      case "payment_failed":
        return <CreditCard className="h-5 w-5 text-red-400" />;
      case "number_down":
        return <PhoneOff className="h-5 w-5 text-red-400" />;
      default:
        return <Bell className="h-5 w-5 text-blue-400" />;
    }
  };

  const getAlertBadge = (type: string) => {
    switch (type) {
      case "ad_rejected":
        return <Badge className="bg-red-500/20 text-red-400">Anúncio Rejeitado</Badge>;
      case "account_restricted":
        return <Badge className="bg-orange-500/20 text-orange-400">Conta Restrita</Badge>;
      case "payment_failed":
        return <Badge className="bg-red-500/20 text-red-400">Falha Pagamento</Badge>;
      case "number_down":
        return <Badge className="bg-red-500/20 text-red-400">Número Caiu</Badge>;
      default:
        return <Badge variant="secondary">{type}</Badge>;
    }
  };

  const unreadCount = alerts.filter(a => !a.is_read).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Avisos Inteligentes</h1>
        <p className="text-muted-foreground">
          Receba alertas sobre seus anúncios e números de WhatsApp
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Alerts List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Alertas
              {unreadCount > 0 && (
                <Badge className="bg-red-500">{unreadCount}</Badge>
              )}
            </h2>
          </div>

          <div className="space-y-3">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20" />
              ))
            ) : alerts.length === 0 ? (
              <Card className="bg-card/50">
                <CardContent className="py-12 text-center">
                  <Bell className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Nenhum alerta no momento</p>
                </CardContent>
              </Card>
            ) : (
              <AnimatePresence>
                {alerts.map((alert, index) => (
                  <motion.div
                    key={alert.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ delay: index * 0.03 }}
                  >
                    <Card className={cn(
                      "bg-card/50 backdrop-blur border-border/50 transition-all",
                      !alert.is_read && "border-l-4 border-l-red-500"
                    )}>
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          {getAlertIcon(alert.alert_type)}
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              {getAlertBadge(alert.alert_type)}
                              <span className="text-xs text-muted-foreground">
                                {formatDistanceToNow(new Date(alert.created_at), { 
                                  addSuffix: true, 
                                  locale: ptBR 
                                })}
                              </span>
                            </div>
                            <h3 className="font-medium">{alert.title}</h3>
                            {alert.message && (
                              <p className="text-sm text-muted-foreground mt-1">{alert.message}</p>
                            )}
                          </div>
                          {!alert.is_read && (
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => handleMarkAsRead(alert.id)}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-6">
          {/* Alert Numbers */}
          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  Números para Avisos
                </span>
                <Dialog open={addNumberDialogOpen} onOpenChange={setAddNumberDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="sm">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Adicionar Número para Avisos</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
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
                          placeholder="Meu WhatsApp"
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setAddNumberDialogOpen(false)}>
                        Cancelar
                      </Button>
                      <Button onClick={handleAddAlertNumber}>
                        Adicionar
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {alertNumbers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Adicione um número para receber avisos
                </p>
              ) : (
                alertNumbers.map(num => (
                  <div 
                    key={num.id} 
                    className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                  >
                    <div>
                      <p className="text-sm font-medium">{num.phone_number}</p>
                      {num.label && (
                        <p className="text-xs text-muted-foreground">{num.label}</p>
                      )}
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleRemoveAlertNumber(num.id)}
                    >
                      <Trash2 className="h-4 w-4 text-red-400" />
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Monitored WhatsApp Numbers */}
          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Smartphone className="h-4 w-4" />
                Números Monitorados
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {whatsappNumbers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Configure números no Tracker WhatsApp
                </p>
              ) : (
                whatsappNumbers.map(num => (
                  <div 
                    key={num.id} 
                    className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                  >
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "w-2 h-2 rounded-full",
                        num.is_active ? "bg-green-500" : "bg-red-500"
                      )} />
                      <div>
                        <p className="text-sm font-medium">{num.phone_number}</p>
                        {num.label && (
                          <p className="text-xs text-muted-foreground">{num.label}</p>
                        )}
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {num.is_active ? "Online" : "Offline"}
                    </Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
