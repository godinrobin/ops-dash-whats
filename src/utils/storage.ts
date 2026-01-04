import { Product, Metric } from "@/types/product";
import { supabase } from "@/integrations/supabase/client";

export const getProducts = async (userId?: string): Promise<Product[]> => {
  // Always require a userId to prevent showing all products
  if (!userId) {
    console.warn('getProducts called without userId');
    return [];
  }

  const { data, error } = await supabase
    .from("products")
    .select("*, metrics!metrics_product_id_fkey(*)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .order("created_at", { referencedTable: "metrics", ascending: false });

  if (error) {
    console.error('Error fetching products:', error);
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
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return null;
  }

  const { data, error } = await supabase
    .from("products")
    .insert({
      id: product.id,
      name: product.name,
      last_update: product.lastUpdate,
      user_id: user.id,
    })
    .select()
    .single();

  if (error) {
    return null;
  }

  return data.id;
};

export const updateProduct = async (
  productId: string,
  updates: Partial<Product>
): Promise<void> => {
  await supabase
    .from("products")
    .update({
      name: updates.name,
      last_update: updates.lastUpdate || new Date().toLocaleDateString("pt-BR"),
    })
    .eq("id", productId);
};

export const deleteProduct = async (productId: string): Promise<void> => {
  await supabase
    .from("products")
    .delete()
    .eq("id", productId);
};

export const getProduct = async (
  productId: string
): Promise<Product | undefined> => {
  const { data, error } = await supabase
    .from("products")
    .select("*, metrics!metrics_product_id_fkey(*)")
    .eq("id", productId)
    .order("created_at", { referencedTable: "metrics", ascending: false })
    .single();

  if (error) {
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
  const { data: product } = await supabase
    .from("products")
    .select("name")
    .eq("id", productId)
    .single();

  await supabase.from("metrics").insert([{
    product_id: productId,
    product_name: product?.name || "",
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
  }]);

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
  await supabase
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

  await supabase
    .from("products")
    .update({ last_update: new Date().toLocaleDateString("pt-BR") })
    .eq("id", productId);
};

export const deleteMetric = async (
  productId: string,
  metricId: string
): Promise<void> => {
  await supabase
    .from("metrics")
    .delete()
    .eq("id", metricId);

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
