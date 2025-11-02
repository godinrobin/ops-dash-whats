import { Product, Metric } from "@/types/product";
import { supabase } from "@/integrations/supabase/client";

export const getProducts = async (): Promise<Product[]> => {
  const { data, error } = await supabase
    .from("products")
    .select("*, metrics(*)")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching products:", error);
    return [];
  }

  return data.map((product) => ({
    id: product.id,
    name: product.name,
    lastUpdate: product.last_update,
    metrics: (product.metrics || []).map((m: any) => ({
      id: m.id,
      date: m.date,
      structure: m.structure,
      invested: m.invested,
      leads: m.leads,
      pixCount: m.pix_count,
      pixTotal: m.pix_total,
      cpl: m.cpl,
      conversion: m.conversion,
      result: m.result,
      roas: m.roas,
    })),
  }));
};

export const saveProducts = async (products: Product[]): Promise<void> => {
  // Not used anymore, keeping for compatibility
};

export const addProduct = async (product: Product): Promise<string | null> => {
  const { data, error } = await supabase
    .from("products")
    .insert({
      id: product.id,
      name: product.name,
      last_update: product.lastUpdate,
    })
    .select()
    .single();

  if (error) {
    console.error("Error adding product:", error);
    return null;
  }

  return data.id;
};

export const updateProduct = async (
  productId: string,
  updates: Partial<Product>
): Promise<void> => {
  const { error } = await supabase
    .from("products")
    .update({
      name: updates.name,
      last_update: updates.lastUpdate || new Date().toLocaleDateString("pt-BR"),
    })
    .eq("id", productId);

  if (error) {
    console.error("Error updating product:", error);
  }
};

export const deleteProduct = async (productId: string): Promise<void> => {
  const { error } = await supabase
    .from("products")
    .delete()
    .eq("id", productId);

  if (error) {
    console.error("Error deleting product:", error);
  }
};

export const getProduct = async (
  productId: string
): Promise<Product | undefined> => {
  const { data, error } = await supabase
    .from("products")
    .select("*, metrics(*)")
    .eq("id", productId)
    .single();

  if (error) {
    console.error("Error fetching product:", error);
    return undefined;
  }

  return {
    id: data.id,
    name: data.name,
    lastUpdate: data.last_update,
    metrics: (data.metrics || []).map((m: any) => ({
      id: m.id,
      date: m.date,
      structure: m.structure,
      invested: m.invested,
      leads: m.leads,
      pixCount: m.pix_count,
      pixTotal: m.pix_total,
      cpl: m.cpl,
      conversion: m.conversion,
      result: m.result,
      roas: m.roas,
    })),
  };
};

export const addMetric = async (
  productId: string,
  metric: Metric
): Promise<void> => {
  const { error } = await supabase.from("metrics").insert({
    id: metric.id,
    product_id: productId,
    date: metric.date,
    structure: metric.structure,
    invested: metric.invested,
    leads: metric.leads,
    pix_count: metric.pixCount,
    pix_total: metric.pixTotal,
    cpl: metric.cpl,
    conversion: metric.conversion,
    result: metric.result,
    roas: metric.roas,
  });

  if (error) {
    console.error("Error adding metric:", error);
    return;
  }

  await supabase
    .from("products")
    .update({ last_update: new Date().toLocaleDateString("pt-BR") })
    .eq("id", productId);
};

export const updateMetric = async (
  productId: string,
  metricId: string,
  updatedMetric: Metric
): Promise<void> => {
  const { error } = await supabase
    .from("metrics")
    .update({
      date: updatedMetric.date,
      structure: updatedMetric.structure,
      invested: updatedMetric.invested,
      leads: updatedMetric.leads,
      pix_count: updatedMetric.pixCount,
      pix_total: updatedMetric.pixTotal,
      cpl: updatedMetric.cpl,
      conversion: updatedMetric.conversion,
      result: updatedMetric.result,
      roas: updatedMetric.roas,
    })
    .eq("id", metricId);

  if (error) {
    console.error("Error updating metric:", error);
    return;
  }

  await supabase
    .from("products")
    .update({ last_update: new Date().toLocaleDateString("pt-BR") })
    .eq("id", productId);
};

export const deleteMetric = async (
  productId: string,
  metricId: string
): Promise<void> => {
  const { error } = await supabase
    .from("metrics")
    .delete()
    .eq("id", metricId);

  if (error) {
    console.error("Error deleting metric:", error);
    return;
  }

  await supabase
    .from("products")
    .update({ last_update: new Date().toLocaleDateString("pt-BR") })
    .eq("id", productId);
};

export const getUniqueStructures = async (
  productId: string
): Promise<string[]> => {
  const { data, error } = await supabase
    .from("metrics")
    .select("structure")
    .eq("product_id", productId);

  if (error) {
    console.error("Error fetching structures:", error);
    return [];
  }

  const uniqueStructures = [
    ...new Set(data.map((item) => item.structure)),
  ];
  return uniqueStructures;
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
