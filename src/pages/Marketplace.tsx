import { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Wallet, Phone, BarChart3, ShoppingBag, ArrowLeft, Shield, Truck, CreditCard, 
  Check, Minus, Plus, Clock, HeadphonesIcon, Star, X, Copy, Loader2
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { RechargeModal } from "@/components/RechargeModal";
import { useActivityTracker } from "@/hooks/useActivityTracker";

// Import product images
import bmVerificadaImg from "@/assets/bm-verificada.png";
import bmSimplesImg from "@/assets/bm-simples.png";
import perfilAntigoRealImg from "@/assets/perfil-antigo-real.png";
import perfilComumImg from "@/assets/perfil-comum.png";
import perfilReestabelecidoImg from "@/assets/perfil-reestabelecido.png";
import perfilVerificadoImg from "@/assets/perfil-verificado.png";
import comboMasterImg from "@/assets/combo-master.png";
import comboDiamondImg from "@/assets/combo-diamond.png";

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
  stock: number;
  sold_count: number;
}

const IMAGE_MAP: Record<string, string> = {
  "/assets/bm-verificada.png": bmVerificadaImg,
  "/assets/bm-simples.png": bmSimplesImg,
  "/assets/perfil-antigo-real.png": perfilAntigoRealImg,
  "/assets/perfil-comum.png": perfilComumImg,
  "/assets/perfil-reestabelecido.png": perfilReestabelecidoImg,
  "/assets/perfil-verificado.png": perfilVerificadoImg,
  "/assets/combo-master.png": comboMasterImg,
  "/assets/combo-diamond.png": comboDiamondImg,
};

interface MarketplaceProps {
  onModeChange?: (mode: "sistemas" | "marketplace") => void;
  currentMode?: "sistemas" | "marketplace";
}

const Marketplace = ({ onModeChange, currentMode }: MarketplaceProps) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  useActivityTracker("marketplace", "Marketplace");

  const [activeTab, setActiveTab] = useState("numeros-virtuais");
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState(0);
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  
  // Product detail state
  const [selectedProduct, setSelectedProduct] = useState<MarketplaceProduct | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [purchasing, setPurchasing] = useState(false);

  // Purchase success modal
  const [purchaseSuccess, setPurchaseSuccess] = useState(false);
  const [purchasedProductName, setPurchasedProductName] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerWhatsApp, setCustomerWhatsApp] = useState("");
  const [savingOrder, setSavingOrder] = useState(false);
  const [orderSaved, setOrderSaved] = useState(false);
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      loadProducts();
      loadBalance();
    }
  }, [user]);

  const loadProducts = async () => {
    try {
      const { data, error } = await supabase
        .from("marketplace_products")
        .select("*")
        .order("category")
        .order("price");

      if (error) throw error;
      setProducts((data || []) as MarketplaceProduct[]);
    } catch (err) {
      console.error("Error loading products:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadBalance = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from("sms_user_wallets")
        .select("balance")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!error && data) {
        setBalance(Number(data.balance));
      }
    } catch (err) {
      console.error("Error loading balance:", err);
    }
  };

  const categories = [...new Set(products.map(p => p.category))];
  const filteredProducts = selectedCategory 
    ? products.filter(p => p.category === selectedCategory)
    : products;

  const getProductImage = (imageUrl: string | null) => {
    if (!imageUrl) return "";
    return IMAGE_MAP[imageUrl] || imageUrl;
  };

  const handlePurchase = async () => {
    if (!selectedProduct || !user) return;

    const totalPrice = selectedProduct.price * quantity;
    
    if (balance < totalPrice) {
      toast.error("Saldo insuficiente. Recarregue sua carteira.");
      return;
    }

    setPurchasing(true);
    try {
      // Deduct balance
      const { error: walletError } = await supabase
        .from("sms_user_wallets")
        .update({ balance: balance - totalPrice })
        .eq("user_id", user.id);

      if (walletError) throw walletError;

      // Create order
      const { data: orderData, error: orderError } = await supabase
        .from("marketplace_orders")
        .insert({
          user_id: user.id,
          product_id: selectedProduct.id,
          product_name: selectedProduct.name,
          quantity,
          total_price: totalPrice,
          status: "pending"
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Update sold count
      await supabase
        .from("marketplace_products")
        .update({ sold_count: (selectedProduct.sold_count || 0) + quantity })
        .eq("id", selectedProduct.id);

      // Record transaction
      await supabase
        .from("sms_transactions")
        .insert({
          user_id: user.id,
          type: "purchase",
          amount: -totalPrice,
          description: `Compra: ${quantity}x ${selectedProduct.name}`
        });

      setBalance(prev => prev - totalPrice);
      setPurchasedProductName(`${quantity}x ${selectedProduct.name}`);
      setCurrentOrderId(orderData.id);
      setSelectedProduct(null);
      setPurchaseSuccess(true);
      setOrderSaved(false);
      setCustomerName("");
      setCustomerWhatsApp("");
      loadProducts();
    } catch (err) {
      console.error("Error purchasing:", err);
      toast.error("Erro ao processar compra");
    } finally {
      setPurchasing(false);
    }
  };

  const handleSaveOrderDetails = async () => {
    if (!customerName.trim() || !customerWhatsApp.trim() || !currentOrderId) {
      toast.error("Preencha todos os campos");
      return;
    }

    setSavingOrder(true);
    try {
      const { error } = await supabase
        .from("marketplace_orders")
        .update({
          customer_name: customerName,
          customer_whatsapp: customerWhatsApp,
          status: "confirmed"
        })
        .eq("id", currentOrderId);

      if (error) throw error;
      setOrderSaved(true);
      toast.success("Dados salvos com sucesso!");
    } catch (err) {
      console.error("Error saving order details:", err);
      toast.error("Erro ao salvar dados");
    } finally {
      setSavingOrder(false);
    }
  };

  const similarProducts = selectedProduct 
    ? products.filter(p => p.category === selectedProduct.category && p.id !== selectedProduct.id)
    : [];

  const renderProductCard = (product: MarketplaceProduct) => (
    <Card 
      key={product.id}
      className={`bg-secondary border-accent/30 overflow-hidden cursor-pointer hover:border-accent transition-colors ${product.is_sold_out ? 'opacity-60' : ''}`}
      onClick={() => !product.is_sold_out && setSelectedProduct(product)}
    >
      <div className="relative aspect-video overflow-hidden">
        <img 
          src={getProductImage(product.image_url)} 
          alt={product.name}
          className="w-full h-full object-cover object-top rounded-t-lg"
          style={{ marginLeft: '-5%', marginRight: '-5%', width: '110%' }}
        />
        {product.is_sold_out && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <Badge variant="destructive" className="text-lg px-4 py-2">
              <X className="h-4 w-4 mr-2" />
              ESGOTADO
            </Badge>
          </div>
        )}
      </div>
      <CardContent className="p-4">
        <h3 className="font-bold text-lg mb-2 line-clamp-2">{product.name}</h3>
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-xl font-bold text-green-500">
            R$ {product.price.toFixed(2).replace('.', ',')}
          </span>
          {product.discount_percent && (
            <Badge variant="outline" className="text-accent border-accent text-xs">
              -{product.discount_percent}%
            </Badge>
          )}
        </div>
        {product.compare_price && (
          <p className="text-sm text-muted-foreground line-through">
            R$ {product.compare_price.toFixed(2).replace('.', ',')}
          </p>
        )}
        <p className="text-xs text-muted-foreground mt-1">À vista no Pix</p>
        
        <Button 
          className={`w-full mt-4 ${product.is_sold_out ? 'bg-destructive hover:bg-destructive' : 'bg-accent hover:bg-accent/90 text-accent-foreground'}`}
          disabled={product.is_sold_out}
        >
          {product.is_sold_out ? (
            <>
              <X className="h-4 w-4 mr-2" />
              Esgotado
            </>
          ) : (
            <>
              <ShoppingBag className="h-4 w-4 mr-2" />
              Comprar agora
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );

  return (
    <>
      <Header mode={currentMode} onModeChange={onModeChange} />
      <div className="h-14 md:h-16" />
      <div className="min-h-screen bg-background p-4 md:p-6">
        <div className="container mx-auto max-w-6xl">
          {/* Wallet Card */}
          <Card className="mb-6 bg-gradient-to-r from-accent/20 to-orange-500/20 border-accent">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Wallet className="h-8 w-8 text-accent" />
                <div>
                  <p className="text-sm text-muted-foreground">Seu saldo</p>
                  <p className="text-2xl font-bold text-accent">
                    R$ {balance.toFixed(2).replace('.', ',')}
                  </p>
                </div>
              </div>
              <Button onClick={() => setRechargeOpen(true)} className="bg-accent hover:bg-accent/90">
                <Plus className="h-4 w-4 mr-2" />
                Recarregar
              </Button>
            </CardContent>
          </Card>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-6">
              <TabsTrigger value="numeros-virtuais" className="flex items-center gap-2">
                <Phone className="h-4 w-4" />
                <span className="hidden sm:inline">Números Virtuais</span>
              </TabsTrigger>
              <TabsTrigger value="painel-marketing" className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                <span className="hidden sm:inline">Painel Marketing</span>
              </TabsTrigger>
              <TabsTrigger value="ativos" className="flex items-center gap-2">
                <ShoppingBag className="h-4 w-4" />
                <span className="hidden sm:inline">Ativos para Anúncios</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="numeros-virtuais">
              <Card className="border-accent/30">
                <CardContent className="p-6 text-center">
                  <Phone className="h-16 w-16 mx-auto text-accent mb-4" />
                  <h3 className="text-xl font-bold mb-2">Números Virtuais</h3>
                  <p className="text-muted-foreground mb-4">
                    Compre números virtuais para receber SMS de verificação
                  </p>
                  <Button onClick={() => navigate("/sms-bot")} className="bg-accent hover:bg-accent/90">
                    Acessar Números Virtuais
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="painel-marketing">
              <Card className="border-accent/30">
                <CardContent className="p-6 text-center">
                  <BarChart3 className="h-16 w-16 mx-auto text-accent mb-4" />
                  <h3 className="text-xl font-bold mb-2">Painel Marketing</h3>
                  <p className="text-muted-foreground mb-4">
                    Compre seguidores, curtidas e visualizações para suas redes sociais
                  </p>
                  <Button onClick={() => navigate("/smm-panel")} className="bg-accent hover:bg-accent/90">
                    Acessar Painel Marketing
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="ativos">
              {/* Category Filter */}
              <div className="flex flex-wrap gap-2 mb-6">
                <Button
                  variant={selectedCategory === null ? "default" : "outline"}
                  onClick={() => setSelectedCategory(null)}
                  className={selectedCategory === null ? "bg-accent" : ""}
                >
                  Todos
                </Button>
                {categories.map(cat => (
                  <Button
                    key={cat}
                    variant={selectedCategory === cat ? "default" : "outline"}
                    onClick={() => setSelectedCategory(cat)}
                    className={selectedCategory === cat ? "bg-accent" : ""}
                  >
                    {cat}
                  </Button>
                ))}
              </div>

              {/* Products Grid */}
              {loading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-accent" />
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {filteredProducts.map(renderProductCard)}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Product Detail Modal */}
      <Dialog open={!!selectedProduct} onOpenChange={(open) => !open && setSelectedProduct(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-background border-accent">
          {selectedProduct && (
            <div className="space-y-6">
              <Button
                variant="ghost"
                onClick={() => setSelectedProduct(null)}
                className="text-accent hover:text-accent/80"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Voltar para a página inicial
              </Button>

              <div className="grid md:grid-cols-2 gap-6">
                {/* Product Image */}
                <div className="rounded-lg overflow-hidden">
                  <img 
                    src={getProductImage(selectedProduct.image_url)} 
                    alt={selectedProduct.name}
                    className="w-full h-auto object-cover rounded-lg"
                    style={{ marginLeft: '-3%', width: '106%' }}
                  />
                </div>

                {/* Product Info */}
                <div className="space-y-4">
                  <h2 className="text-2xl font-bold">{selectedProduct.name}</h2>
                  
                  <div className="flex items-baseline gap-3">
                    <span className="text-3xl font-bold text-green-500">
                      R$ {selectedProduct.price.toFixed(2).replace('.', ',')}
                    </span>
                    {selectedProduct.discount_percent && (
                      <Badge className="bg-accent text-accent-foreground">
                        -{selectedProduct.discount_percent}%
                      </Badge>
                    )}
                  </div>

                  {selectedProduct.compare_price && (
                    <p className="text-muted-foreground line-through">
                      R$ {selectedProduct.compare_price.toFixed(2).replace('.', ',')}
                    </p>
                  )}

                  <p className="text-muted-foreground">À vista no Pix</p>

                  <div className="flex gap-2">
                    <Badge variant="outline" className="text-green-500 border-green-500">
                      <Check className="h-3 w-3 mr-1" />
                      {selectedProduct.stock} disponíveis
                    </Badge>
                    <Badge variant="outline" className="text-accent border-accent">
                      📈 {selectedProduct.sold_count} vendidos
                    </Badge>
                  </div>

                  {/* Quantity */}
                  <div className="flex items-center gap-4">
                    <Label>Quantidade:</Label>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <span className="w-12 text-center font-bold">{quantity}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setQuantity(Math.min(selectedProduct.stock, quantity + 1))}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="bg-secondary p-3 rounded-lg">
                    <p className="text-sm text-muted-foreground">Total:</p>
                    <p className="text-2xl font-bold text-accent">
                      R$ {(selectedProduct.price * quantity).toFixed(2).replace('.', ',')}
                    </p>
                  </div>

                  <Button 
                    className="w-full bg-accent hover:bg-accent/90 text-accent-foreground py-6 text-lg"
                    onClick={handlePurchase}
                    disabled={purchasing}
                  >
                    {purchasing ? (
                      <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    ) : (
                      <ShoppingBag className="h-5 w-5 mr-2" />
                    )}
                    Comprar agora
                  </Button>

                  {/* Trust Badges */}
                  <div className="grid grid-cols-3 gap-2 text-center text-sm">
                    <div className="flex flex-col items-center gap-1">
                      <Shield className="h-5 w-5 text-green-500" />
                      <span>Compra segura</span>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <Clock className="h-5 w-5 text-accent" />
                      <span>Entrega em 12h</span>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <CreditCard className="h-5 w-5 text-green-500" />
                      <span>Pagamento via PIX</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Description */}
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-bold mb-3">Descrição do produto</h3>
                  <div className="whitespace-pre-wrap text-muted-foreground">
                    {selectedProduct.description}
                  </div>

                  <div className="mt-6 space-y-4">
                    <div className="p-4 bg-secondary rounded-lg">
                      <h4 className="font-bold mb-2">📦 Como eu recebo meu ativo?</h4>
                      <p className="text-sm text-muted-foreground">
                        Após a compra do ativo, aparecerá um pop up para você inserir seus dados, 
                        e entraremos em contato com você imediatamente para entrega do seu ativo.
                      </p>
                    </div>

                    <div className="p-4 bg-secondary rounded-lg">
                      <h4 className="font-bold mb-2">🛡️ Política de Garantia</h4>
                      <p className="text-sm text-muted-foreground">
                        Caso ao logar em algum ativo, e ele já esteja bloqueado, 
                        iremos te disponibilizar um novo ativo imediatamente.
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-bold mb-3">Especificações do Ativo</h3>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500" />
                      <span>Ativo digital premium</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500" />
                      <span>Entrega em até 12h</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500" />
                      <span>Suporte incluso</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500" />
                      <span>Pronto para uso</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Similar Products */}
              {similarProducts.length > 0 && (
                <div>
                  <h3 className="text-lg font-bold mb-4">Produtos similares</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {similarProducts.slice(0, 4).map(p => (
                      <Card 
                        key={p.id} 
                        className="bg-secondary border-accent/30 cursor-pointer hover:border-accent"
                        onClick={() => {
                          setSelectedProduct(p);
                          setQuantity(1);
                        }}
                      >
                        <div className="aspect-video overflow-hidden rounded-t-lg">
                          <img 
                            src={getProductImage(p.image_url)} 
                            alt={p.name}
                            className="w-full h-full object-cover object-top"
                          />
                        </div>
                        <CardContent className="p-3">
                          <p className="font-medium text-sm line-clamp-1">{p.name}</p>
                          <p className="text-green-500 font-bold">
                            R$ {p.price.toFixed(2).replace('.', ',')}
                          </p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Purchase Success Modal */}
      <Dialog open={purchaseSuccess} onOpenChange={(open) => {
        if (!open && orderSaved) {
          setPurchaseSuccess(false);
        }
      }}>
        <DialogContent className="bg-background border-accent">
          <DialogHeader>
            <DialogTitle className="text-center">
              {orderSaved ? (
                <span className="text-green-500">🎉 Obrigado!</span>
              ) : (
                <span className="text-green-500">✅ Compra realizada com sucesso!</span>
              )}
            </DialogTitle>
          </DialogHeader>

          {orderSaved ? (
            <div className="text-center space-y-4 py-6">
              <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
                <Check className="h-10 w-10 text-green-500" />
              </div>
              <p className="text-lg">Em breve nossa equipe entrará em contato com você para enviar seu ativo!</p>
              <Button onClick={() => setPurchaseSuccess(false)} className="bg-accent hover:bg-accent/90">
                Fechar
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
                <Check className="h-8 w-8 text-green-500" />
              </div>

              <div className="text-center">
                <p className="text-lg font-bold mb-1">Parabéns pela compra!</p>
                <p className="text-muted-foreground">{purchasedProductName}</p>
              </div>

              <div className="space-y-3">
                <div>
                  <Label>Produto (não editável)</Label>
                  <Input value={purchasedProductName} disabled className="bg-muted" />
                </div>
                <div>
                  <Label>Seu nome *</Label>
                  <Input 
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Digite seu nome completo"
                  />
                </div>
                <div>
                  <Label>Seu WhatsApp *</Label>
                  <Input 
                    value={customerWhatsApp}
                    onChange={(e) => setCustomerWhatsApp(e.target.value)}
                    placeholder="Ex: 11999999999"
                  />
                </div>
              </div>

              <Button 
                className="w-full bg-accent hover:bg-accent/90" 
                onClick={handleSaveOrderDetails}
                disabled={savingOrder}
              >
                {savingOrder ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Check className="h-4 w-4 mr-2" />
                )}
                Confirmar dados
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <RechargeModal 
        open={rechargeOpen} 
        onOpenChange={setRechargeOpen}
        onSuccess={(newBalance) => setBalance(newBalance)}
      />
    </>
  );
};

export default Marketplace;