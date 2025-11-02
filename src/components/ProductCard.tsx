import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Product } from "@/types/product";

interface ProductCardProps {
  product: Product;
}

export const ProductCard = ({ product }: ProductCardProps) => {
  const navigate = useNavigate();

  return (
    <Card className="transition-all hover:shadow-soft hover:scale-[1.02] cursor-pointer">
      <CardHeader>
        <CardTitle className="text-xl">{product.name}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Última atualização: {product.lastUpdate || "Nunca"}
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          {product.metrics.length} registro(s)
        </p>
      </CardContent>
      <CardFooter>
        <Button
          onClick={() => navigate(`/produto/${product.id}`)}
          className="w-full"
          variant="default"
        >
          Abrir Métricas
        </Button>
      </CardFooter>
    </Card>
  );
};
