import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Product } from "@/types/product";
import { Pencil, Trash2, Check, X, TrendingUp } from "lucide-react";
import { updateProduct, deleteProduct } from "@/utils/storage";
import { toast } from "sonner";

interface ProductCardProps {
  product: Product;
  onUpdate: () => void;
}

export const ProductCard = ({ product, onUpdate }: ProductCardProps) => {
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(product.name);

  const handleSave = async () => {
    if (!editedName.trim()) {
      toast.error("O nome do produto não pode estar vazio");
      return;
    }

    await updateProduct(product.id, { name: editedName });
    setIsEditing(false);
    onUpdate();
    toast.success("Produto atualizado com sucesso!");
  };

  const handleDelete = async () => {
    if (window.confirm("Tem certeza que deseja apagar este produto e todas suas métricas?")) {
      await deleteProduct(product.id);
      onUpdate();
      toast.success("Produto deletado com sucesso!");
    }
  };

  return (
    <Card className="transition-all hover:shadow-soft hover:scale-[1.02]">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          {isEditing ? (
            <div className="flex items-center gap-2 flex-1">
              <Input
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                className="flex-1"
                autoFocus
              />
              <Button size="icon" variant="ghost" onClick={handleSave}>
                <Check className="h-4 w-4 text-positive" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  setIsEditing(false);
                  setEditedName(product.name);
                }}
              >
                <X className="h-4 w-4 text-negative" />
              </Button>
            </div>
          ) : (
            <>
              <CardTitle className="text-xl flex-1">{product.name}</CardTitle>
              <div className="flex gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setIsEditing(true)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleDelete}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Última atualização: {product.lastUpdate || "Nunca"}
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          {product.metrics.length} registro(s)
        </p>
      </CardContent>
      <CardFooter className="flex gap-2">
        <Button
          onClick={() => navigate(`/produto/${product.id}`)}
          className="flex-1"
          variant="default"
        >
          Abrir Métricas
        </Button>
        <Button
          onClick={() => navigate(`/produto/${product.id}/analise`)}
          className="flex-1"
          variant="secondary"
        >
          <TrendingUp className="h-4 w-4 mr-2" />
          Análise
        </Button>
      </CardFooter>
    </Card>
  );
};
