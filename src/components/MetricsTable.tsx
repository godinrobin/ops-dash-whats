import { useState } from "react";
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
import { Metric } from "@/types/product";
import { Pencil, Trash2 } from "lucide-react";
import { deleteMetric } from "@/utils/storage";
import { toast } from "sonner";
import { EditMetricModal } from "./EditMetricModal";

interface MetricsTableProps {
  productId: string;
  metrics: Metric[];
  onMetricChanged: () => void;
}

export const MetricsTable = ({ productId, metrics, onMetricChanged }: MetricsTableProps) => {
  const [editingMetric, setEditingMetric] = useState<Metric | null>(null);

  const handleDelete = (metricId: string) => {
    if (confirm("Tem certeza que deseja apagar esta métrica?")) {
      deleteMetric(productId, metricId);
      toast.success("Métrica apagada com sucesso!");
      onMetricChanged();
    }
  };

  if (metrics.length === 0) {
    return null;
  }

  return (
    <>
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Métricas Registradas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Estrutura</TableHead>
                  <TableHead>Investido</TableHead>
                  <TableHead>Leads</TableHead>
                  <TableHead>Qnt Pix</TableHead>
                  <TableHead>Pix Total</TableHead>
                  <TableHead>CPL</TableHead>
                  <TableHead>% Conv</TableHead>
                  <TableHead>Resultado</TableHead>
                  <TableHead>ROAS</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.map((metric) => (
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
              </TableBody>
            </Table>
          </div>
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
