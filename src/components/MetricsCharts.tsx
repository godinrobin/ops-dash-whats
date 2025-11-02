import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Metric } from "@/types/product";

interface MetricsChartsProps {
  metrics: Metric[];
}

// Generate a consistent color for each structure based on a hash
const stringToColor = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Generate HSL color with good saturation and lightness for visibility
  const hue = Math.abs(hash % 360);
  const saturation = 65 + (Math.abs(hash) % 20); // 65-85%
  const lightness = 55 + (Math.abs(hash >> 8) % 15); // 55-70%
  
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
};

export const MetricsCharts = ({ metrics }: MetricsChartsProps) => {
  if (metrics.length === 0) {
    return (
      <Card className="shadow-card">
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">
            Adicione métricas para visualizar os gráficos
          </p>
        </CardContent>
      </Card>
    );
  }

  const structures = Array.from(new Set(metrics.map((m) => m.structure)));

  return (
    <div className="space-y-6">
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>CPL por Data</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={metrics}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="date" stroke="#888" />
              <YAxis stroke="#888" />
              <Tooltip
                contentStyle={{ backgroundColor: "#1a1a1a", border: "1px solid #333" }}
                formatter={(value: number) =>
                  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                }
              />
              <Legend />
              {structures.map((structure) => (
                <Line
                  key={structure}
                  type="monotone"
                  dataKey="cpl"
                  data={metrics.filter((m) => m.structure === structure)}
                  name={structure}
                  stroke={stringToColor(structure)}
                  strokeWidth={2}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>% de Conversão por Data</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={metrics}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="date" stroke="#888" />
              <YAxis stroke="#888" />
              <Tooltip
                contentStyle={{ backgroundColor: "#1a1a1a", border: "1px solid #333" }}
                formatter={(value: number) => `${value.toFixed(2)}%`}
              />
              <Legend />
              {structures.map((structure) => (
                <Line
                  key={structure}
                  type="monotone"
                  dataKey="conversion"
                  data={metrics.filter((m) => m.structure === structure)}
                  name={structure}
                  stroke={stringToColor(structure)}
                  strokeWidth={2}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>ROAS por Data</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={metrics}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="date" stroke="#888" />
              <YAxis stroke="#888" />
              <Tooltip
                contentStyle={{ backgroundColor: "#1a1a1a", border: "1px solid #333" }}
                formatter={(value: number) => `${value.toFixed(2)}x`}
              />
              <Legend />
              {structures.map((structure) => (
                <Line
                  key={structure}
                  type="monotone"
                  dataKey="roas"
                  data={metrics.filter((m) => m.structure === structure)}
                  name={structure}
                  stroke={stringToColor(structure)}
                  strokeWidth={2}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
};
