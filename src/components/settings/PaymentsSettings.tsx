import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, CreditCard, Plus, Trash2, Star, StarOff, History, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/useSplashedToast";
import { useAuth } from "@/contexts/AuthContext";
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
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AddPaymentMethodModal } from "@/components/AddPaymentMethodModal";

interface PaymentMethod {
  id: string;
  card_brand: string;
  card_last4: string;
  card_exp_month: number;
  card_exp_year: number;
  is_primary: boolean;
  created_at: string;
}

interface RenewalLog {
  id: string;
  renewal_type: string;
  credits_used: number | null;
  card_amount_charged: number | null;
  status: string;
  error_message: string | null;
  created_at: string;
}

interface CreditTransaction {
  id: string;
  amount: number;
  type: string;
  description: string;
  created_at: string;
}

export function PaymentsSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [renewalLogs, setRenewalLogs] = useState<RenewalLog[]>([]);
  const [creditTransactions, setCreditTransactions] = useState<CreditTransaction[]>([]);
  const [autoRenewalEnabled, setAutoRenewalEnabled] = useState(true);
  const [deleteMethodId, setDeleteMethodId] = useState<string | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Load payment methods
      const { data: methodsData } = await supabase.functions.invoke('manage-payment-methods', {
        body: { action: 'list' },
      });
      setPaymentMethods(methodsData?.methods || []);

      // Load profile for auto-renewal setting
      const { data: profile } = await supabase
        .from('profiles')
        .select('auto_renewal_enabled')
        .eq('id', user.id)
        .single();
      
      setAutoRenewalEnabled(profile?.auto_renewal_enabled !== false);

      // Load renewal logs
      const { data: logs } = await supabase
        .from('instance_renewal_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);
      
      setRenewalLogs(logs || []);

      // Load credit transactions (recharges)
      const { data: transactions } = await supabase
        .from('credit_transactions')
        .select('*')
        .eq('user_id', user.id)
        .in('type', ['purchase', 'card_recharge', 'pix_recharge'])
        .order('created_at', { ascending: false })
        .limit(50);
      
      setCreditTransactions(transactions || []);
    } catch (error) {
      console.error('Error loading payment data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSetPrimary = async (methodId: string) => {
    setActionLoading(methodId);
    try {
      const { error } = await supabase.functions.invoke('manage-payment-methods', {
        body: { action: 'set-primary', paymentMethodId: methodId },
      });
      if (error) throw error;
      
      setPaymentMethods(prev => prev.map(m => ({
        ...m,
        is_primary: m.id === methodId,
      })));
      
      toast({ title: 'Cartão definido como principal' });
    } catch (error: any) {
      toast({ title: error.message || 'Erro ao definir cartão principal', variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteMethod = async () => {
    if (!deleteMethodId) return;
    setActionLoading(deleteMethodId);
    
    try {
      const { error } = await supabase.functions.invoke('manage-payment-methods', {
        body: { action: 'delete', paymentMethodId: deleteMethodId },
      });
      if (error) throw error;
      
      setPaymentMethods(prev => prev.filter(m => m.id !== deleteMethodId));
      toast({ title: 'Cartão removido com sucesso' });
    } catch (error: any) {
      toast({ title: error.message || 'Erro ao remover cartão', variant: 'destructive' });
    } finally {
      setDeleteMethodId(null);
      setActionLoading(null);
    }
  };

  const handleToggleAutoRenewal = async (enabled: boolean) => {
    try {
      await supabase
        .from('profiles')
        .update({ auto_renewal_enabled: enabled })
        .eq('id', user?.id);
      
      setAutoRenewalEnabled(enabled);
      toast({ 
        title: enabled 
          ? 'Renovação automática ativada' 
          : 'Renovação automática desativada' 
      });
    } catch (error: any) {
      toast({ title: 'Erro ao alterar configuração', variant: 'destructive' });
    }
  };

  const getCardBrandIcon = (brand: string) => {
    const brands: Record<string, string> = {
      visa: '💳 Visa',
      mastercard: '💳 Mastercard',
      amex: '💳 Amex',
      elo: '💳 Elo',
    };
    return brands[brand?.toLowerCase()] || `💳 ${brand}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Auto Renewal Toggle */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-accent" />
            Renovação Automática
          </CardTitle>
          <CardDescription>
            Quando ativada, suas instâncias serão renovadas automaticamente usando seus créditos ou cartão cadastrado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium">
                {autoRenewalEnabled ? 'Ativada' : 'Desativada'}
              </p>
              <p className="text-xs text-muted-foreground">
                {autoRenewalEnabled 
                  ? 'Suas instâncias serão renovadas automaticamente' 
                  : 'Você precisará renovar suas instâncias manualmente'}
              </p>
            </div>
            <Switch
              checked={autoRenewalEnabled}
              onCheckedChange={handleToggleAutoRenewal}
              className="data-[state=checked]:bg-green-500"
            />
          </div>
        </CardContent>
      </Card>

      {/* Saved Cards */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-accent" />
                Cartões Salvos
              </CardTitle>
              <CardDescription>
                Gerencie seus métodos de pagamento
              </CardDescription>
            </div>
            <Button onClick={() => setAddModalOpen(true)} size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Adicionar Cartão
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {paymentMethods.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CreditCard className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Nenhum cartão cadastrado</p>
              <p className="text-xs mt-1">Adicione um cartão para recargas mais rápidas</p>
            </div>
          ) : (
            <div className="space-y-3">
              {paymentMethods.map((method) => (
                <div 
                  key={method.id}
                  className={`flex items-center justify-between p-4 rounded-lg border ${
                    method.is_primary ? 'border-accent bg-accent/5' : 'border-border'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="text-2xl">💳</div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium capitalize">{method.card_brand}</span>
                        <span className="text-muted-foreground">****{method.card_last4}</span>
                        {method.is_primary && (
                          <Badge variant="secondary" className="bg-accent/20 text-accent">
                            Principal
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Expira em {method.card_exp_month.toString().padStart(2, '0')}/{method.card_exp_year}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!method.is_primary && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSetPrimary(method.id)}
                        disabled={actionLoading === method.id}
                      >
                        {actionLoading === method.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Star className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteMethodId(method.id)}
                      disabled={actionLoading === method.id}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recharge History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-accent" />
            Histórico de Recargas
          </CardTitle>
          <CardDescription>
            Suas últimas recargas de créditos
          </CardDescription>
        </CardHeader>
        <CardContent>
          {creditTransactions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <History className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Nenhuma recarga encontrada</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Créditos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {creditTransactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="text-sm">
                      {format(new Date(tx.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </TableCell>
                    <TableCell className="text-sm">{tx.description}</TableCell>
                    <TableCell className="text-right font-medium text-green-500">
                      +{tx.amount.toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Renewal Logs */}
      {renewalLogs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-accent" />
              Histórico de Renovações
            </CardTitle>
            <CardDescription>
              Tentativas de renovação automática de instâncias
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {renewalLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-sm">
                      {format(new Date(log.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </TableCell>
                    <TableCell className="text-sm capitalize">{log.renewal_type}</TableCell>
                    <TableCell>
                      <Badge variant={log.status === 'success' ? 'default' : 'destructive'}>
                        {log.status === 'success' ? 'Sucesso' : 'Falhou'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {log.credits_used ? `${log.credits_used} créditos` : ''}
                      {log.card_amount_charged ? `R$ ${log.card_amount_charged.toFixed(2)}` : ''}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteMethodId} onOpenChange={() => setDeleteMethodId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover cartão?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso removerá o cartão da sua conta. Você poderá adicionar novamente depois.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteMethod} className="bg-destructive text-destructive-foreground">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Payment Method Modal */}
      <AddPaymentMethodModal
        open={addModalOpen}
        onOpenChange={setAddModalOpen}
        onSuccess={() => {
          loadData();
          setAddModalOpen(false);
        }}
      />
    </div>
  );
}
