import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { addMetric, calculateMetrics, getUniqueStructures } from "@/utils/storage";
import { Metric } from "@/types/product";
import { toast } from "sonner";

interface MetricsFormProps {
  productId: string;
  onMetricAdded: () => void;
}

export const MetricsForm = ({ productId, onMetricAdded }: MetricsFormProps) => {
  const [structures, setStructures] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    date: "",
    structure: "",
    invested: "",
    leads: "",
    pixCount: "",
    pixTotal: "",
  });

  useEffect(() => {
    loadStructures();
  }, [productId]);

  const loadStructures = async () => {
    const uniqueStructures = await getUniqueStructures(productId);
    setStructures(uniqueStructures);
  };

  const handleChange = (field: string, value: string) => {
    if (field === "date") {
      // Remove non-numeric characters
      const numericValue = value.replace(/\D/g, "");
      
      // Format as DD/MM
      let formattedValue = numericValue;
      if (numericValue.length >= 3) {
        formattedValue = `${numericValue.slice(0, 2)}/${numericValue.slice(2, 4)}`;
      }
      
      setFormData((prev) => ({ ...prev, [field]: formattedValue }));
    } else {
      setFormData((prev) => ({ ...prev, [field]: value }));
    }
  };

  const calculatedMetrics = calculateMetrics(
    parseFloat(formData.invested) || 0,
    parseFloat(formData.leads) || 0,
    parseFloat(formData.pixCount) || 0,
    parseFloat(formData.pixTotal) || 0
  );

  const handleSubmit = async (e: React.FormEvent) => {
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

    await addMetric(productId, metric);
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
    loadStructures();
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
                maxLength={5}
                value={formData.date}
                onChange={(e) => handleChange("date", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="structure">Estrutura</Label>
              <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between"
                  >
                    {formData.structure || "Selecione ou digite..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput
                      placeholder="Digite a estrutura..."
                      value={formData.structure}
                      onValueChange={(value) =>
                        setFormData({ ...formData, structure: value })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && formData.structure) {
                          e.preventDefault();
                          setOpen(false);
                        }
                      }}
                    />
                    <CommandEmpty>
                      <Button
                        variant="ghost"
                        className="w-full"
                        onClick={() => {
                          setOpen(false);
                        }}
                      >
                        Usar "{formData.structure}"
                      </Button>
                    </CommandEmpty>
                    <CommandGroup>
                      {structures.map((structure) => (
                        <CommandItem
                          key={structure}
                          value={structure}
                          onSelect={(currentValue) => {
                            setFormData({
                              ...formData,
                              structure: currentValue,
                            });
                            setOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              formData.structure === structure
                                ? "opacity-100"
                                : "opacity-0"
                            )}
                          />
                          {structure}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </Command>
                </PopoverContent>
              </Popover>
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
