import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addMetric, calculateMetrics } from "@/utils/storage";
import { Metric } from "@/types/product";
import { toast } from "sonner";

interface MetricsFormProps {
  productId: string;
  onMetricAdded: () => void;
}

export const MetricsForm = ({ productId, onMetricAdded }: MetricsFormProps) => {
  const [formData, setFormData] = useState({
    date: "",
    structure: "",
    invested: "",
    leads: "",
    pixCount: "",
    pixTotal: "",
  });

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const calculatedMetrics = calculateMetrics(
    parseFloat(formData.invested) || 0,
    parseFloat(formData.leads) || 0,
    parseFloat(formData.pixCount) || 0,
    parseFloat(formData.pixTotal) || 0
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.date || !formData.structure) {
      toast.error("Por favor, preencha data e estrutura");
      return;
    }

    const metric: Metric = {
      id: crypto.randomUUID(),
      date: formData.date,
      structure: formData.structure,
      invested: parseFloat(formData.invested) || 0,
      leads: parseFloat(formData.leads) || 0,
      pixCount: parseFloat(formData.pixCount) || 0,
      pixTotal: parseFloat(formData.pixTotal) || 0,
      ...calculatedMetrics,
    };

    addMetric(productId, metric);
    toast.success("Métrica registrada com sucesso!");
    
    setFormData({
      date: "",
      structure: "",
      invested: "",
      leads: "",
      pixCount: "",
      pixTotal: "",
    });
    
    onMetricAdded();
  };

  return (
    <Card className="shadow-card">
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">Data (DD/MM)</Label>
              <Input
                id="date"
                placeholder="02/09"
                value={formData.date}
                onChange={(e) => handleChange("date", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="structure">Estrutura</Label>
              <Input
                id="structure"
                placeholder="Ex: Estrutura A"
                value={formData.structure}
                onChange={(e) => handleChange("structure", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invested">Investido (R$)</Label>
              <Input
                id="invested"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={formData.invested}
                onChange={(e) => handleChange("invested", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="leads">Leads</Label>
              <Input
                id="leads"
                type="number"
                placeholder="0"
                value={formData.leads}
                onChange={(e) => handleChange("leads", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pixCount">Qnt Pix</Label>
              <Input
                id="pixCount"
                type="number"
                placeholder="0"
                value={formData.pixCount}
                onChange={(e) => handleChange("pixCount", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pixTotal">Pix Total (R$)</Label>
              <Input
                id="pixTotal"
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

          <Button type="submit" className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
            Salvar Métrica
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
