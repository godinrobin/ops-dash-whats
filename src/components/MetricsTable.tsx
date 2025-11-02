import { useState, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Metric } from "@/types/product";
import { Pencil, Trash2, ChevronDown, ChevronUp, ArrowUpDown } from "lucide-react";
import { deleteMetric } from "@/utils/storage";
import { toast } from "sonner";
import { EditMetricModal } from "./EditMetricModal";

interface MetricsTableProps {
  productId: string;
  metrics: Metric[];
  onMetricChanged: () => void;
}

type SortField = "date" | "structure" | "invested" | "leads" | "pixCount" | "pixTotal" | "cpl" | "conversion" | "result" | "roas";
type SortDirection = "asc" | "desc" | null;

export const MetricsTable = ({ productId, metrics, onMetricChanged }: MetricsTableProps) => {
  const [editingMetric, setEditingMetric] = useState<Metric | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [selectedStructure, setSelectedStructure] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  const handleDelete = async (metricId: string) => {
    if (confirm("Tem certeza que deseja apagar esta métrica?")) {
      await deleteMetric(productId, metricId);
      toast.success("Métrica apagada com sucesso!");
      onMetricChanged();
    }
  };

  // Extract unique months
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    metrics.forEach((metric) => {
      const [, month] = metric.date.split("/");
      if (month) months.add(month);
    });
    return Array.from(months).sort();
  }, [metrics]);

  // Extract unique structures
  const availableStructures = useMemo(() => {
    const structures = new Set(metrics.map((m) => m.structure));
    return Array.from(structures).sort();
  }, [metrics]);

  // Filter and sort metrics
  const filteredMetrics = useMemo(() => {
    let filtered = [...metrics];

    // Filter by month
    if (selectedMonth !== "all") {
      filtered = filtered.filter((metric) => {
        const [, month] = metric.date.split("/");
        return month === selectedMonth;
      });
    }

    // Filter by structure
    if (selectedStructure !== "all") {
      filtered = filtered.filter(
        (metric) => metric.structure === selectedStructure
      );
    }

    // Sort
    if (sortField && sortDirection) {
      filtered.sort((a, b) => {
        let aValue: any = a[sortField];
        let bValue: any = b[sortField];

        // Handle date sorting
        if (sortField === "date") {
          const [dayA, monthA] = a.date.split("/").map(Number);
          const [dayB, monthB] = b.date.split("/").map(Number);
          aValue = monthA * 100 + dayA;
          bValue = monthB * 100 + dayB;
        }

        if (sortDirection === "asc") {
          return aValue > bValue ? 1 : -1;
        } else {
          return aValue < bValue ? 1 : -1;
        }
      });
    }

    return filtered;
  }, [metrics, selectedMonth, selectedStructure, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else if (sortDirection === "desc") {
        setSortField(null);
        setSortDirection(null);
      }
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const displayedMetrics = isExpanded ? filteredMetrics : filteredMetrics.slice(0, 10);

  // Calculate totals
  const totals = useMemo(() => {
    return filteredMetrics.reduce(
      (acc, metric) => ({
        invested: acc.invested + metric.invested,
        leads: acc.leads + metric.leads,
        pixCount: acc.pixCount + metric.pixCount,
        pixTotal: acc.pixTotal + metric.pixTotal,
        cpl: acc.cpl + metric.cpl,
        conversion: acc.conversion + metric.conversion,
        result: acc.result + metric.result,
        roas: acc.roas + metric.roas,
      }),
      {
        invested: 0,
        leads: 0,
        pixCount: 0,
        pixTotal: 0,
        cpl: 0,
        conversion: 0,
        result: 0,
        roas: 0,
      }
    );
  }, [filteredMetrics]);

  const averages = {
    cpl: filteredMetrics.length > 0 ? totals.cpl / filteredMetrics.length : 0,
    conversion:
      filteredMetrics.length > 0 ? totals.conversion / filteredMetrics.length : 0,
    roas: filteredMetrics.length > 0 ? totals.roas / filteredMetrics.length : 0,
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ArrowUpDown className="ml-2 h-4 w-4" />;
    }
    return sortDirection === "asc" ? (
      <ChevronUp className="ml-2 h-4 w-4" />
    ) : (
      <ChevronDown className="ml-2 h-4 w-4" />
    );
  };

  if (metrics.length === 0) {
    return null;
  }

  return (
    <>
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Métricas Registradas</CardTitle>
          <div className="flex flex-col sm:flex-row gap-4 pt-4">
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Filtrar por mês" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os meses</SelectItem>
                {availableMonths.map((month) => (
                  <SelectItem key={month} value={month}>
                    Mês {month}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedStructure} onValueChange={setSelectedStructure}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Filtrar por estrutura" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as estruturas</SelectItem>
                {availableStructures.map((structure) => (
                  <SelectItem key={structure} value={structure}>
                    {structure}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleSort("date")}
                    >
                      <div className="flex items-center">
                        Data
                        <SortIcon field="date" />
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleSort("structure")}
                    >
                      <div className="flex items-center">
                        Estrutura
                        <SortIcon field="structure" />
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleSort("invested")}
                    >
                      <div className="flex items-center">
                        Investido
                        <SortIcon field="invested" />
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleSort("leads")}
                    >
                      <div className="flex items-center">
                        Leads
                        <SortIcon field="leads" />
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleSort("pixCount")}
                    >
                      <div className="flex items-center">
                        Qnt Pix
                        <SortIcon field="pixCount" />
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleSort("pixTotal")}
                    >
                      <div className="flex items-center">
                        Pix Total
                        <SortIcon field="pixTotal" />
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleSort("cpl")}
                    >
                      <div className="flex items-center">
                        CPL
                        <SortIcon field="cpl" />
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleSort("conversion")}
                    >
                      <div className="flex items-center">
                        % Conv
                        <SortIcon field="conversion" />
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleSort("result")}
                    >
                      <div className="flex items-center">
                        Resultado
                        <SortIcon field="result" />
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleSort("roas")}
                    >
                      <div className="flex items-center">
                        ROAS
                        <SortIcon field="roas" />
                      </div>
                    </TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedMetrics.map((metric) => (
                    <TableRow key={metric.id}>
                      <TableCell className="font-medium">{metric.date}</TableCell>
                      <TableCell>{metric.structure}</TableCell>
                      <TableCell>
                        {metric.invested.toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })}
                      </TableCell>
                      <TableCell>{metric.leads}</TableCell>
                      <TableCell>{metric.pixCount}</TableCell>
                      <TableCell>
                        {metric.pixTotal.toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })}
                      </TableCell>
                      <TableCell>
                        {metric.cpl.toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })}
                      </TableCell>
                      <TableCell>{metric.conversion.toFixed(2)}%</TableCell>
                      <TableCell
                        className={metric.result >= 0 ? "text-positive" : "text-negative"}
                      >
                        {metric.result.toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })}
                      </TableCell>
                      <TableCell>{metric.roas.toFixed(2)}x</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="secondary"
                            size="icon"
                            onClick={() => setEditingMetric(metric)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="destructive"
                            size="icon"
                            onClick={() => handleDelete(metric.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Totals Row - Sticky at bottom */}
                  <TableRow className="bg-muted/50 font-semibold sticky bottom-0">
                    <TableCell colSpan={2}>TOTAIS / MÉDIAS</TableCell>
                    <TableCell>
                      {totals.invested.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </TableCell>
                    <TableCell>{totals.leads}</TableCell>
                    <TableCell>{totals.pixCount}</TableCell>
                    <TableCell>
                      {totals.pixTotal.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </TableCell>
                    <TableCell>
                      {averages.cpl.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </TableCell>
                    <TableCell>{averages.conversion.toFixed(2)}%</TableCell>
                    <TableCell
                      className={
                        totals.result >= 0 ? "text-positive" : "text-negative"
                      }
                    >
                      {totals.result.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </TableCell>
                    <TableCell>{averages.roas.toFixed(2)}x</TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>

          {filteredMetrics.length > 10 && (
            <div className="flex justify-center mt-4">
              <Button
                variant="outline"
                onClick={() => setIsExpanded(!isExpanded)}
                className="gap-2"
              >
                {isExpanded ? (
                  <>
                    <ChevronUp className="h-4 w-4" />
                    Recolher
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-4 w-4" />
                    Expandir ({filteredMetrics.length - 10} mais)
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <EditMetricModal
        productId={productId}
        metric={editingMetric}
        open={editingMetric !== null}
        onOpenChange={(open) => !open && setEditingMetric(null)}
        onMetricUpdated={onMetricChanged}
      />
    </>
  );
};
