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
}

export const CreateProductModal = ({ open, onOpenChange }: CreateProductModalProps) => {
  const [productName, setProductName] = useState("");
  const navigate = useNavigate();

  const handleCreate = () => {
    if (!productName.trim()) {
      toast.error("Por favor, insira um nome para o produto");
      return;
    }

    const newProduct: Product = {
      id: crypto.randomUUID(),
      name: productName,
      lastUpdate: new Date().toLocaleDateString("pt-BR"),
      metrics: [],
    };

    addProduct(newProduct);
    toast.success("Produto criado com sucesso!");
    setProductName("");
    onOpenChange(false);
    navigate(`/produto/${newProduct.id}`);
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
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleCreate} className="bg-accent text-accent-foreground hover:bg-accent/90">
            Criar Produto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
