export interface Metric {
  id: string;
  date: string;
  structure: string;
  invested: number;
  leads: number;
  pixCount: number;
  pixTotal: number;
  cpl: number;
  conversion: number;
  result: number;
  roas: number;
}

export interface Product {
  id: string;
  name: string;
  lastUpdate: string;
  metrics: Metric[];
}
