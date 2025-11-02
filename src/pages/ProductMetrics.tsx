import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { MetricsForm } from "@/components/MetricsForm";
import { MetricsCharts } from "@/components/MetricsCharts";
import { MetricsTable } from "@/components/MetricsTable";
import { ProductNavigation } from "@/components/ProductNavigation";
import { CreateProductModal } from "@/components/CreateProductModal";
import { getProduct, getProducts } from "@/utils/storage";
import { Product } from "@/types/product";
import { ArrowLeft } from "lucide-react";

const ProductMetrics = () => {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const loadData = () => {
    if (productId) {
      const foundProduct = getProduct(productId);
      if (foundProduct) {
        setProduct(foundProduct);
      } else {
        navigate("/");
      }
    }
    setProducts(getProducts());
  };

  useEffect(() => {
    loadData();
  }, [productId, isModalOpen]);

  if (!product) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="container mx-auto max-w-7xl p-6 md:p-10">
        <header className="mb-8">
          <Button
            variant="secondary"
            onClick={() => navigate("/")}
            className="mb-4"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
          <h1 className="text-3xl md:text-4xl font-bold text-center mb-2">{product.name}</h1>
          <p className="text-center text-muted-foreground">
            Última atualização: {product.lastUpdate}
          </p>
        </header>

        <div className="space-y-8">
          <section>
            <h2 className="text-2xl font-semibold mb-4">Adicionar Nova Métrica</h2>
            <MetricsForm productId={product.id} onMetricAdded={loadData} />
          </section>

          <section>
            <MetricsTable 
              productId={product.id} 
              metrics={product.metrics} 
              onMetricChanged={loadData}
            />
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">Gráficos Comparativos</h2>
            <MetricsCharts metrics={product.metrics} />
          </section>
        </div>
      </div>

      <ProductNavigation
        products={products}
        currentProductId={product.id}
        onCreateClick={() => setIsModalOpen(true)}
      />

      <CreateProductModal open={isModalOpen} onOpenChange={setIsModalOpen} />
    </div>
  );
};

export default ProductMetrics;
