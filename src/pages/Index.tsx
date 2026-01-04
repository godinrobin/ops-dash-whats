import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ProductCard } from "@/components/ProductCard";
import { CreateProductModal } from "@/components/CreateProductModal";
import { Header } from "@/components/Header";
import { getProducts } from "@/utils/storage";
import { Product } from "@/types/product";
import { useEffectiveUser } from "@/hooks/useEffectiveUser";

const Index = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const { effectiveUserId } = useEffectiveUser();

  const loadProducts = useCallback(async () => {
    setLoading(true);
    // Pass effectiveUserId to filter by impersonated user when applicable
    const data = await getProducts(effectiveUserId || undefined);
    setProducts(data);
    setLoading(false);
  }, [effectiveUserId]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const handleProductCreated = () => {
    loadProducts();
    setIsModalOpen(false);
  };

  return (
    <>
      <Header />
      <div className="h-14 md:h-16" />
      <div className="min-h-screen bg-background p-6 md:p-10">
        <div className="container mx-auto max-w-6xl">
          <header className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">📊 Meus Produtos</h1>
            <p className="text-muted-foreground text-lg">
              Gerencie suas métricas de WhatsApp com facilidade
            </p>
          </header>

        {loading ? (
          <div className="text-center py-20">
            <p className="text-muted-foreground text-lg">Carregando...</p>
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-muted-foreground text-lg mb-6">
              Você ainda não tem produtos cadastrados
            </p>
            <Button
              onClick={() => setIsModalOpen(true)}
              size="lg"
              className="bg-accent text-accent-foreground hover:bg-accent/90"
            >
              + Cadastrar meu primeiro produto
            </Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} onUpdate={loadProducts} />
              ))}
            </div>
            <div className="text-center">
              <Button
                onClick={() => setIsModalOpen(true)}
                size="lg"
                className="bg-accent text-accent-foreground hover:bg-accent/90"
              >
                + Cadastrar novo produto
              </Button>
            </div>
          </>
        )}

        <CreateProductModal 
          open={isModalOpen} 
          onOpenChange={setIsModalOpen}
          onProductCreated={handleProductCreated}
        />

          <footer className="mt-16 text-center text-xs text-muted-foreground/50">
            Criado por <a href="https://instagram.com/joaolucassps" target="_blank" rel="noopener noreferrer" className="hover:text-muted-foreground transition-colors">@joaolucassps</a>
          </footer>
        </div>
      </div>
    </>
  );
};

export default Index;
