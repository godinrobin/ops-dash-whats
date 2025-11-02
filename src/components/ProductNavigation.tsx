import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Product } from "@/types/product";
import { Plus } from "lucide-react";

interface ProductNavigationProps {
  products: Product[];
  currentProductId?: string;
  onCreateClick: () => void;
}

export const ProductNavigation = ({
  products,
  currentProductId,
  onCreateClick,
}: ProductNavigationProps) => {
  const navigate = useNavigate();

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-secondary/95 backdrop-blur-sm border-t border-border p-4 z-50">
      <div className="container mx-auto flex items-center justify-between gap-4">
        <div className="flex gap-2 overflow-x-auto flex-1 scrollbar-hide">
          {products.map((product) => (
            <Button
              key={product.id}
              variant={currentProductId === product.id ? "default" : "secondary"}
              onClick={() => navigate(`/produto/${product.id}`)}
              className="whitespace-nowrap"
            >
              {product.name}
            </Button>
          ))}
        </div>
        <Button
          onClick={onCreateClick}
          size="icon"
          className="bg-accent text-accent-foreground hover:bg-accent/90 rounded-full flex-shrink-0"
        >
          <Plus className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
};
