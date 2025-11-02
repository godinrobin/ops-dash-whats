import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addProduct } from "@/utils/storage";
import { Product } from "@/types/product";
import { toast } from "sonner";

interface CreateProductModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProductCreated: () => void;
}

export const CreateProductModal = ({ open, onOpenChange, onProductCreated }: CreateProductModalProps) => {
  const [productName, setProductName] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleCreate = async () => {
    if (!productName.trim()) {
      toast.error("Por favor, insira um nome para o produto");
      return;
    }

    setLoading(true);

    const newProduct: Product = {
      id: crypto.randomUUID(),
      name: productName,
      lastUpdate: new Date().toLocaleDateString("pt-BR"),
      metrics: [],
    };

    const productId = await addProduct(newProduct);
    
    if (productId) {
      toast.success("Produto criado com sucesso!");
      setProductName("");
      onOpenChange(false);
      onProductCreated();
      navigate(`/produto/${productId}`);
    } else {
      toast.error("Erro ao criar produto. Tente novamente.");
    }

    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Criar novo produto</DialogTitle>
          <DialogDescription>
            Insira o nome do produto para começar a registrar métricas
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="productName">Nome do Produto</Label>
            <Input
              id="productName"
              placeholder="Ex: Curso WhatsApp Pro"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !loading && handleCreate()}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button 
            onClick={handleCreate} 
            className="bg-accent text-accent-foreground hover:bg-accent/90"
            disabled={loading}
          >
            {loading ? "Criando..." : "Criar Produto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
