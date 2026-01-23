import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Package,
  Plus,
  Edit2,
  Trash2,
  Loader2,
  Check,
  X,
  Eye,
  EyeOff
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { toast } from "sonner";

interface CreditPackage {
  id: string;
  name: string;
  credits: number;
  price_brl: number;
  is_active: boolean;
  sort_order: number;
}

const EMPTY_PACKAGE = {
  name: '',
  credits: 10,
  price_brl: 65,
  sort_order: 0
};

export const AdminCreditPackages = () => {
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPackage, setEditingPackage] = useState<CreditPackage | null>(null);
  const [formData, setFormData] = useState(EMPTY_PACKAGE);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    loadPackages();
  }, []);

  const loadPackages = async () => {
    try {
      const { data, error } = await supabase
        .from('credit_packages')
        .select('*')
        .order('sort_order');

      if (error) throw error;
      setPackages(data ?? []);
    } catch (error) {
      console.error('Error loading packages:', error);
      toast.error('Erro ao carregar pacotes');
    } finally {
      setLoading(false);
    }
  };

  const openCreateDialog = () => {
    setEditingPackage(null);
    setFormData({ ...EMPTY_PACKAGE, sort_order: packages.length + 1 });
    setDialogOpen(true);
  };

  const openEditDialog = (pkg: CreditPackage) => {
    setEditingPackage(pkg);
    setFormData({
      name: pkg.name,
      credits: pkg.credits,
      price_brl: pkg.price_brl,
      sort_order: pkg.sort_order
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }

    setSaving(true);
    try {
      if (editingPackage) {
        // Update
        const { error } = await supabase
          .from('credit_packages')
          .update({
            name: formData.name,
            credits: formData.credits,
            price_brl: formData.price_brl,
            sort_order: formData.sort_order
          })
          .eq('id', editingPackage.id);

        if (error) throw error;
        toast.success('Pacote atualizado');
      } else {
        // Create
        const { error } = await supabase
          .from('credit_packages')
          .insert({
            name: formData.name,
            credits: formData.credits,
            price_brl: formData.price_brl,
            sort_order: formData.sort_order,
            is_active: true
          });

        if (error) throw error;
        toast.success('Pacote criado');
      }

      await loadPackages();
      setDialogOpen(false);
    } catch (error) {
      console.error('Error saving package:', error);
      toast.error('Erro ao salvar pacote');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (pkg: CreditPackage) => {
    try {
      const { error } = await supabase
        .from('credit_packages')
        .update({ is_active: !pkg.is_active })
        .eq('id', pkg.id);

      if (error) throw error;
      toast.success(pkg.is_active ? 'Pacote desativado' : 'Pacote ativado');
      await loadPackages();
    } catch (error) {
      console.error('Error toggling package:', error);
      toast.error('Erro ao alterar status');
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;

    try {
      const { error } = await supabase
        .from('credit_packages')
        .delete()
        .eq('id', deleteConfirm);

      if (error) throw error;
      toast.success('Pacote excluído');
      await loadPackages();
    } catch (error) {
      console.error('Error deleting package:', error);
      toast.error('Erro ao excluir pacote');
    } finally {
      setDeleteConfirm(null);
    }
  };

  const formatBRL = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
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
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Pacotes de Créditos
              </CardTitle>
              <CardDescription>
                Gerencie os pacotes disponíveis para compra
              </CardDescription>
            </div>
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Pacote
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead className="text-center">Créditos</TableHead>
                  <TableHead className="text-center">Preço (R$)</TableHead>
                  <TableHead className="text-center">R$/Crédito</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="w-[120px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {packages.map((pkg) => (
                  <TableRow key={pkg.id} className={!pkg.is_active ? 'opacity-50' : ''}>
                    <TableCell className="font-medium">{pkg.name}</TableCell>
                    <TableCell className="text-center font-mono">{pkg.credits}</TableCell>
                    <TableCell className="text-center">{formatBRL(pkg.price_brl)}</TableCell>
                    <TableCell className="text-center text-muted-foreground">
                      {formatBRL(pkg.price_brl / pkg.credits)}
                    </TableCell>
                    <TableCell className="text-center">
                      {pkg.is_active ? (
                        <Badge className="bg-green-500">Ativo</Badge>
                      ) : (
                        <Badge variant="secondary">Inativo</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => toggleActive(pkg)}
                          className="h-8 w-8"
                        >
                          {pkg.is_active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => openEditDialog(pkg)}
                          className="h-8 w-8"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setDeleteConfirm(pkg.id)}
                          className="h-8 w-8 text-red-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {packages.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Nenhum pacote cadastrado
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingPackage ? 'Editar Pacote' : 'Novo Pacote'}
            </DialogTitle>
            <DialogDescription>
              {editingPackage ? 'Altere as informações do pacote' : 'Crie um novo pacote de créditos'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome do Pacote</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ex: Pacote Premium"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="credits">Quantidade de Créditos</Label>
                <Input
                  id="credits"
                  type="number"
                  min="1"
                  value={formData.credits}
                  onChange={(e) => setFormData({ ...formData, credits: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="price">Preço (R$)</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.price_brl}
                  onChange={(e) => setFormData({ ...formData, price_brl: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>

            {formData.credits > 0 && formData.price_brl > 0 && (
              <div className="p-3 rounded-lg bg-secondary/50 text-center">
                <p className="text-sm text-muted-foreground">Valor por crédito:</p>
                <p className="text-lg font-bold">{formatBRL(formData.price_brl / formData.credits)}</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Salvar
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Pacote?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O pacote será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
