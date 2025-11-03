import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateMetric, calculateMetrics } from "@/utils/storage";
import { Metric } from "@/types/product";
import { toast } from "sonner";

interface EditMetricModalProps {
  productId: string;
  metric: Metric | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMetricUpdated: () => void;
}

export const EditMetricModal = ({
  productId,
  metric,
  open,
  onOpenChange,
  onMetricUpdated,
}: EditMetricModalProps) => {
  const [formData, setFormData] = useState({
    date: "",
    structure: "",
    invested: "",
    leads: "",
    pixCount: "",
    pixTotal: "",
  });

  useEffect(() => {
    if (metric) {
      setFormData({
        date: metric.date,
        structure: metric.structure,
        invested: metric.invested.toString(),
        leads: metric.leads.toString(),
        pixCount: metric.pixCount.toString(),
        pixTotal: metric.pixTotal.toString(),
      });
    }
  }, [metric]);

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const calculatedMetrics = calculateMetrics(
    parseFloat(formData.invested) || 0,
    parseFloat(formData.leads) || 0,
    parseFloat(formData.pixCount) || 0,
    parseFloat(formData.pixTotal) || 0
  );

  const handleSave = async () => {
    if (!metric) return;

    if (!formData.date || !formData.structure) {
      toast.error("Por favor, preencha data e estrutura");
      return;
    }

    const updatedMetric: Metric = {
      id: metric.id,
      date: formData.date,
      structure: formData.structure,
      invested: parseFloat(formData.invested) || 0,
      leads: parseFloat(formData.leads) || 0,
      pixCount: parseFloat(formData.pixCount) || 0,
      pixTotal: parseFloat(formData.pixTotal) || 0,
      ...calculatedMetrics,
    };

    await updateMetric(productId, metric.id, updatedMetric);
    toast.success("Métrica atualizada com sucesso!");
    onOpenChange(false);
    onMetricUpdated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Métrica</DialogTitle>
          <DialogDescription>
            Atualize os valores da métrica
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-date">Data (DD/MM)</Label>
              <Input
                id="edit-date"
                placeholder="02/09"
                value={formData.date}
                onChange={(e) => handleChange("date", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-structure">Estrutura</Label>
              <Input
                id="edit-structure"
                placeholder="Ex: Estrutura A"
                value={formData.structure}
                onChange={(e) => handleChange("structure", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-invested">Investido (R$)</Label>
              <Input
                id="edit-invested"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={formData.invested}
                onChange={(e) => handleChange("invested", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-leads">Leads</Label>
              <Input
                id="edit-leads"
                type="number"
                placeholder="0"
                value={formData.leads}
                onChange={(e) => handleChange("leads", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-pixCount">Qnt Pix</Label>
              <Input
                id="edit-pixCount"
                type="number"
                placeholder="0"
                value={formData.pixCount}
                onChange={(e) => handleChange("pixCount", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-pixTotal">Pix Total (R$)</Label>
              <Input
                id="edit-pixTotal"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={formData.pixTotal}
                onChange={(e) => handleChange("pixTotal", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-border">
            <div className="space-y-1">
              <Label className="text-muted-foreground text-xs">CPL (R$)</Label>
              <p className="text-lg font-semibold">
                {calculatedMetrics.cpl.toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                })}
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-muted-foreground text-xs">% de Conversão</Label>
              <p className="text-lg font-semibold">{calculatedMetrics.conversion.toFixed(2)}%</p>
            </div>
            <div className="space-y-1">
              <Label className="text-muted-foreground text-xs">Resultado (R$)</Label>
              <p
                className={`text-lg font-semibold ${
                  calculatedMetrics.result >= 0 ? "text-positive" : "text-negative"
                }`}
              >
                {calculatedMetrics.result.toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                })}
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-muted-foreground text-xs">ROAS</Label>
              <p className="text-lg font-semibold">{calculatedMetrics.roas.toFixed(2)}x</p>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} className="bg-accent text-accent-foreground hover:bg-accent/90">
            Salvar Alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
