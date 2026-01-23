import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  DollarSign,
  Save,
  Loader2,
  Edit2,
  X,
  Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface SystemPricing {
  id: string;
  system_id: string;
  system_name: string;
  price_type: string;
  credit_cost: number;
  free_tier_limit: number;
  free_tier_period: string | null;
  description: string | null;
  is_active: boolean;
}

export const AdminSystemPricing = () => {
  const [pricing, setPricing] = useState<SystemPricing[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ credit_cost: number; free_tier_limit: number }>({
    credit_cost: 0,
    free_tier_limit: 0
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadPricing();
  }, []);

  const loadPricing = async () => {
    try {
      const { data, error } = await supabase
        .from('system_pricing')
        .select('*')
        .order('system_name');

      if (error) throw error;
      setPricing(data ?? []);
    } catch (error) {
      console.error('Error loading pricing:', error);
      toast.error('Erro ao carregar preços');
    } finally {
      setLoading(false);
    }
  };

  const startEditing = (item: SystemPricing) => {
    setEditingId(item.id);
    setEditValues({
      credit_cost: item.credit_cost,
      free_tier_limit: item.free_tier_limit
    });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditValues({ credit_cost: 0, free_tier_limit: 0 });
  };

  const saveEditing = async () => {
    if (!editingId) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('system_pricing')
        .update({
          credit_cost: editValues.credit_cost,
          free_tier_limit: editValues.free_tier_limit
        })
        .eq('id', editingId);

      if (error) throw error;

      toast.success('Preço atualizado');
      await loadPricing();
      cancelEditing();
    } catch (error) {
      console.error('Error saving pricing:', error);
      toast.error('Erro ao salvar preço');
    } finally {
      setSaving(false);
    }
  };

  const getPriceTypeBadge = (type: string) => {
    switch (type) {
      case 'per_use': return <Badge variant="secondary">Por uso</Badge>;
      case 'monthly': return <Badge variant="outline" className="border-blue-500 text-blue-500">Mensal</Badge>;
      case 'lifetime': return <Badge className="bg-purple-500">Vitalício</Badge>;
      case 'per_batch': return <Badge variant="secondary">Por lote</Badge>;
      default: return <Badge variant="outline">{type}</Badge>;
    }
  };

  const getFreeTierLabel = (limit: number, period: string | null) => {
    if (limit === 0) return '-';
    if (!period) return `${limit} total`;
    switch (period) {
      case '10min': return `${limit}/10min`;
      case 'day': return `${limit}/dia`;
      case 'month': return `${limit}/mês`;
      default: return `${limit}/${period}`;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          Tabela de Preços
        </CardTitle>
        <CardDescription>
          Configure os preços em créditos para cada sistema
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sistema</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-center">Custo (créditos)</TableHead>
                <TableHead className="text-center">Grátis (membro completo)</TableHead>
                <TableHead className="w-[100px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pricing.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{item.system_name}</p>
                      <p className="text-xs text-muted-foreground">{item.description}</p>
                    </div>
                  </TableCell>
                  <TableCell>{getPriceTypeBadge(item.price_type)}</TableCell>
                  <TableCell className="text-center">
                    {editingId === item.id ? (
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editValues.credit_cost}
                        onChange={(e) => setEditValues({ ...editValues, credit_cost: parseFloat(e.target.value) || 0 })}
                        className="w-24 mx-auto text-center"
                      />
                    ) : (
                      <span className="font-mono">{item.credit_cost.toFixed(2)}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {editingId === item.id ? (
                      <Input
                        type="number"
                        min="0"
                        value={editValues.free_tier_limit}
                        onChange={(e) => setEditValues({ ...editValues, free_tier_limit: parseInt(e.target.value) || 0 })}
                        className="w-20 mx-auto text-center"
                      />
                    ) : (
                      <span className="text-muted-foreground">
                        {getFreeTierLabel(item.free_tier_limit, item.free_tier_period)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {editingId === item.id ? (
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={saveEditing}
                          disabled={saving}
                          className="h-8 w-8 text-green-500"
                        >
                          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={cancelEditing}
                          disabled={saving}
                          className="h-8 w-8 text-red-500"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => startEditing(item)}
                        className="h-8 w-8"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};
