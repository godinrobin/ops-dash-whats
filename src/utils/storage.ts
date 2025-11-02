import { Product, Metric } from "@/types/product";

const STORAGE_KEY = "whatsapp_dashboard_products";

export const getProducts = (): Product[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

export const saveProducts = (products: Product[]): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
};

export const addProduct = (product: Product): void => {
  const products = getProducts();
  products.push(product);
  saveProducts(products);
};

export const updateProduct = (productId: string, updates: Partial<Product>): void => {
  const products = getProducts();
  const index = products.findIndex((p) => p.id === productId);
  if (index !== -1) {
    products[index] = { ...products[index], ...updates };
    saveProducts(products);
  }
};

export const getProduct = (productId: string): Product | undefined => {
  const products = getProducts();
  return products.find((p) => p.id === productId);
};

export const addMetric = (productId: string, metric: Metric): void => {
  const products = getProducts();
  const product = products.find((p) => p.id === productId);
  if (product) {
    product.metrics.push(metric);
    product.lastUpdate = new Date().toLocaleDateString("pt-BR");
    saveProducts(products);
  }
};

export const calculateMetrics = (
  invested: number,
  leads: number,
  pixCount: number,
  pixTotal: number
) => {
  const cpl = leads > 0 ? invested / leads : 0;
  const conversion = leads > 0 ? (pixCount / leads) * 100 : 0;
  const result = pixTotal - invested;
  const roas = invested > 0 ? pixTotal / invested : 0;

  return { cpl, conversion, result, roas };
};
