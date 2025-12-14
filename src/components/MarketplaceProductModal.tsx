import { useState, useCallback, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2, Image, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface MarketplaceProduct {
  id: string;
  name: string;
  description: string;
  price: number;
  compare_price: number | null;
  discount_percent: number | null;
  category: string;
  image_url: string | null;
  is_sold_out: boolean;
  stock: number | null;
  sold_count: number | null;
}

interface MarketplaceProductModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  editProduct?: MarketplaceProduct | null;
}

const CATEGORIES = ["BM", "Perfil", "Combo"];

export function MarketplaceProductModal({ 
  open, 
  onOpenChange, 
  onSuccess,
  editProduct 
}: MarketplaceProductModalProps) {
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [comparePrice, setComparePrice] = useState("");
  const [category, setCategory] = useState("BM");
  const [imageUrl, setImageUrl] = useState("");
  const [isSoldOut, setIsSoldOut] = useState(false);
  const [stock, setStock] = useState("999");

  // Reset form when modal opens with edit product
  useEffect(() => {
    if (open) {
      if (editProduct) {
        setName(editProduct.name);
        setDescription(editProduct.description);
        setPrice(editProduct.price.toString());
        setComparePrice(editProduct.compare_price?.toString() || "");
        setCategory(editProduct.category);
        setImageUrl(editProduct.image_url || "");
        setIsSoldOut(editProduct.is_sold_out);
        setStock(editProduct.stock?.toString() || "999");
      } else {
        setName("");
        setDescription("");
        setPrice("");
        setComparePrice("");
        setCategory("BM");
        setImageUrl("");
        setIsSoldOut(false);
        setStock("999");
      }
    }
  }, [open, editProduct]);

  const handleImagePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;

        setUploadingImage(true);
        try {
          const fileName = `product-${Date.now()}.${file.type.split('/')[1]}`;
          const { data, error } = await supabase.storage
            .from('offer-images')
            .upload(fileName, file);

          if (error) throw error;

          const { data: urlData } = supabase.storage
            .from('offer-images')
            .getPublicUrl(data.path);

          setImageUrl(urlData.publicUrl);
          toast.success("Imagem colada com sucesso!");
        } catch (err) {
          console.error("Error uploading image:", err);
          toast.error("Erro ao fazer upload da imagem");
        } finally {
          setUploadingImage(false);
        }
        break;
      }
    }
  }, []);

  const handleSubmit = async () => {
    if (!name.trim() || !description.trim() || !price || !category) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    setLoading(true);
    try {
      const priceValue = parseFloat(price);
      const comparePriceValue = comparePrice ? parseFloat(comparePrice) : null;
      const discountPercent = comparePriceValue 
        ? Math.round(((comparePriceValue - priceValue) / comparePriceValue) * 100)
        : null;

      const productData = {
        name: name.trim(),
        description: description.trim(),
        price: priceValue,
        compare_price: comparePriceValue,
        discount_percent: discountPercent,
        category,
        image_url: imageUrl || null,
        is_sold_out: isSoldOut,
        stock: parseInt(stock) || 999,
      };

      if (editProduct) {
        const { error } = await supabase
          .from("marketplace_products")
          .update(productData)
          .eq("id", editProduct.id);

        if (error) throw error;
        toast.success("Produto atualizado!");
      } else {
        const { error } = await supabase
          .from("marketplace_products")
          .insert(productData);

        if (error) throw error;
        toast.success("Produto cadastrado!");
      }

      onSuccess();
      onOpenChange(false);
    } catch (err) {
      console.error("Error saving product:", err);
      toast.error("Erro ao salvar produto");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto border-2 border-accent">
        <DialogHeader>
          <DialogTitle>
            {editProduct ? "Editar Produto" : "Novo Produto"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Image */}
          <div className="space-y-2">
            <Label>Imagem do Produto</Label>
            <div
              className="border-2 border-dashed border-border rounded-lg p-4 cursor-pointer hover:border-accent transition-colors focus:outline-none focus:border-accent"
              tabIndex={0}
              onPaste={handleImagePaste}
            >
              {uploadingImage ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-8 w-8 animate-spin text-accent" />
                </div>
              ) : imageUrl ? (
                <div className="relative">
                  <img 
                    src={imageUrl} 
                    alt="Preview" 
                    className="max-h-40 mx-auto rounded-lg object-contain"
                  />
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-0 right-0"
                    onClick={() => setImageUrl("")}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Image className="h-8 w-8" />
                  <span className="text-sm text-center">Clique aqui e cole uma imagem (Ctrl+V)</span>
                </div>
              )}
            </div>
          </div>

          {/* Name */}
          <div className="space-y-2">
            <Label>Nome do Produto *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: BM Verificada - Platina"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label>Descrição *</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreva o produto..."
              rows={5}
            />
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label>Categoria *</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a categoria" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Price */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Preço (R$) *</Label>
              <Input
                type="number"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label>Preço Comparação (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={comparePrice}
                onChange={(e) => setComparePrice(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          {/* Stock */}
          <div className="space-y-2">
            <Label>Estoque</Label>
            <Input
              type="number"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              placeholder="999"
            />
          </div>

          {/* Sold Out */}
          <div className="flex items-center justify-between">
            <Label>Marcar como Esgotado</Label>
            <Switch
              checked={isSoldOut}
              onCheckedChange={setIsSoldOut}
            />
          </div>

          {/* Submit */}
          <Button 
            onClick={handleSubmit} 
            disabled={loading}
            className="w-full bg-accent hover:bg-accent/90"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : null}
            {editProduct ? "Salvar Alterações" : "Cadastrar Produto"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
