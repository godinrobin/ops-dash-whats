import { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { NeonButton } from "@/components/ui/neon-button";
import { Badge } from "@/components/ui/badge";
import { 
  AnimatedTabs, 
  AnimatedTabsList, 
  AnimatedTabsTrigger, 
  AnimatedTabsContent,
  AnimatedTabsContents 
} from "@/components/ui/animated-tabs";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Wallet, Phone, BarChart3, ShoppingBag, ArrowLeft, Shield, Truck, CreditCard, 
  Check, Minus, Plus, Clock, X, Loader2, ClipboardList, Globe
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { RechargeModal } from "@/components/RechargeModal";
import { InsufficientBalanceModal } from "@/components/InsufficientBalanceModal";
import { useActivityTracker } from "@/hooks/useActivityTracker";
import { AnimatedSearchBar } from "@/components/ui/animated-search-bar";

// Import product images
import bmVerificadaImg from "@/assets/bm-verificada.png";
import bmSimplesImg from "@/assets/bm-simples.png";
import perfilAntigoRealImg from "@/assets/perfil-antigo-real.png";
import perfilComumImg from "@/assets/perfil-comum.png";
import perfilReestabelecidoImg from "@/assets/perfil-reestabelecido.png";
import perfilVerificadoImg from "@/assets/perfil-verificado.png";
import comboMasterImg from "@/assets/combo-master.png";
import comboDiamondImg from "@/assets/combo-diamond.png";

// Import the actual pages for embedding
import SMSBot from "@/pages/SMSBot";
import SMMPanel from "@/pages/SMMPanel";
import { ProxiesTab } from "@/components/marketplace/ProxiesTab";

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

interface UserOrder {
  id: string;
  product_name: string;
  quantity: number;
  total_price: number;
  status: string;
  created_at: string;
}

const Marketplace = ({ onModeChange, currentMode }: MarketplaceProps) => {
  const { user } = useAuth();
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

  // Insufficient balance modal
  const [insufficientBalanceOpen, setInsufficientBalanceOpen] = useState(false);
  const [requiredAmount, setRequiredAmount] = useState(0);

  // Purchase success modal
  const [purchaseSuccess, setPurchaseSuccess] = useState(false);
  const [purchasedProductName, setPurchasedProductName] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerWhatsApp, setCustomerWhatsApp] = useState("");
  const [savingOrder, setSavingOrder] = useState(false);

  // User orders
  const [userOrders, setUserOrders] = useState<UserOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [showOrders, setShowOrders] = useState(false);
  const [orderSaved, setOrderSaved] = useState(false);
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      loadProducts();
      loadBalance();
      loadUserOrders();
    }
  }, [user]);

  const loadUserOrders = async () => {
    if (!user) return;
    setLoadingOrders(true);
    try {
      const { data, error } = await supabase
        .from("marketplace_orders")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setUserOrders(data || []);
    } catch (err) {
      console.error("Error loading orders:", err);
    } finally {
      setLoadingOrders(false);
    }
  };

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
      setRequiredAmount(totalPrice);
      setInsufficientBalanceOpen(true);
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

      // Create order with status em_andamento
      const { data: orderData, error: orderError } = await supabase
        .from("marketplace_orders")
        .insert({
          user_id: user.id,
          product_id: selectedProduct.id,
          product_name: selectedProduct.name,
          quantity,
          total_price: totalPrice,
          status: "em_andamento"
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Add to local orders immediately for instant UI update
      setUserOrders(prev => [{
        id: orderData.id,
        product_id: selectedProduct.id,
        product_name: selectedProduct.name,
        quantity,
        total_price: totalPrice,
        status: "em_andamento",
        created_at: orderData.created_at,
        customer_name: null,
        customer_whatsapp: null
      }, ...prev]);

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
          customer_whatsapp: customerWhatsApp
        })
        .eq("id", currentOrderId);

      if (error) throw error;
      
      // Update local order immediately
      setUserOrders(prev => prev.map(order => 
        order.id === currentOrderId 
          ? { ...order, customer_name: customerName, customer_whatsapp: customerWhatsApp }
          : order
      ));

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
      <div className="relative overflow-hidden">
        <img 
          src={getProductImage(product.image_url)} 
          alt={product.name}
          className="w-full h-auto object-cover rounded-t-lg"
          style={{ transform: 'scaleX(1.05)', transformOrigin: 'left' }}
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
          <AnimatedTabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <AnimatedTabsList className="grid w-full grid-cols-4 mb-6">
              <AnimatedTabsTrigger value="numeros-virtuais" className="flex items-center gap-2">
                <Phone className="h-4 w-4" />
                <span className="hidden sm:inline">Números Virtuais</span>
              </AnimatedTabsTrigger>
              <AnimatedTabsTrigger value="painel-marketing" className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                <span className="hidden sm:inline">Painel Marketing</span>
              </AnimatedTabsTrigger>
              <AnimatedTabsTrigger value="proxies" className="flex items-center gap-2">
                <Globe className="h-4 w-4" />
                <span className="hidden sm:inline">Proxies</span>
              </AnimatedTabsTrigger>
              <AnimatedTabsTrigger value="ativos" className="flex items-center gap-2">
                <ShoppingBag className="h-4 w-4" />
                <span className="hidden sm:inline">Ativos</span>
              </AnimatedTabsTrigger>
            </AnimatedTabsList>

            <AnimatedTabsContent value="numeros-virtuais" className="-mx-4 md:-mx-6 -mb-4 md:-mb-6">
              <SMSBotEmbed />
            </AnimatedTabsContent>

            <AnimatedTabsContent value="painel-marketing" className="-mx-4 md:-mx-6 -mb-4 md:-mb-6">
              <SMMPanelEmbed />
            </AnimatedTabsContent>

            <AnimatedTabsContent value="proxies">
              <ProxiesTab 
                balance={balance}
                onRecharge={() => setRechargeOpen(true)}
                onBalanceChange={setBalance}
              />
            </AnimatedTabsContent>

            <AnimatedTabsContent value="ativos">
              {/* Orders Button + Category Filter */}
              <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={selectedCategory === null && !showOrders ? "default" : "outline"}
                    onClick={() => { setSelectedCategory(null); setShowOrders(false); }}
                    className={selectedCategory === null && !showOrders ? "bg-accent" : ""}
                  >
                    Todos
                  </Button>
                  {categories.map(cat => (
                    <Button
                      key={cat}
                      variant={selectedCategory === cat && !showOrders ? "default" : "outline"}
                      onClick={() => { setSelectedCategory(cat); setShowOrders(false); }}
                      className={selectedCategory === cat && !showOrders ? "bg-accent" : ""}
                    >
                      {cat}
                    </Button>
                  ))}
                </div>
                <Button
                  variant={showOrders ? "default" : "outline"}
                  onClick={() => { setShowOrders(true); setSelectedCategory(null); }}
                  className={showOrders ? "bg-accent" : "border-accent text-accent hover:bg-accent/10"}
                >
                  <ClipboardList className="h-4 w-4 mr-2" />
                  Pedidos
                </Button>
              </div>

              {/* User Orders View */}
              {showOrders ? (
                <Card className="border-accent">
                  <CardContent className="p-4">
                    <h3 className="text-lg font-bold mb-4">Meus Pedidos</h3>
                    {loadingOrders ? (
                      <div className="flex justify-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin text-accent" />
                      </div>
                    ) : userOrders.length === 0 ? (
                      <p className="text-center text-muted-foreground py-8">Nenhum pedido ainda</p>
                    ) : (
                      <div className="space-y-3">
                        {userOrders.map(order => {
                          const getStatusColor = (status: string) => {
                            switch (status) {
                              case 'em_andamento':
                              case 'pending':
                              case 'confirmed':
                                return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
                              case 'delivered':
                              case 'completed':
                                return 'bg-green-500/20 text-green-400 border-green-500/30';
                              case 'cancelled':
                                return 'bg-red-500/20 text-red-400 border-red-500/30';
                              default:
                                return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
                            }
                          };

                          const getStatusText = (status: string) => {
                            switch (status) {
                              case 'em_andamento':
                              case 'pending':
                                return 'Em andamento';
                              case 'confirmed':
                                return 'Confirmado';
                              case 'delivered':
                              case 'completed':
                                return 'Entregue';
                              case 'cancelled':
                                return 'Cancelado';
                              default:
                                return status;
                            }
                          };

                          return (
                            <div key={order.id} className="flex items-center justify-between p-3 bg-secondary rounded-lg">
                              <div>
                                <p className="font-medium">{order.product_name}</p>
                                <p className="text-sm text-muted-foreground">
                                  {new Date(order.created_at).toLocaleDateString('pt-BR')} • {order.quantity}x
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="font-bold text-green-500">
                                  R$ {order.total_price.toFixed(2).replace('.', ',')}
                                </p>
                                <Badge variant="outline" className={getStatusColor(order.status)}>
                                  {getStatusText(order.status)}
                                </Badge>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : loading ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent" />
                </div>
              ) : (
                <>
                  {filteredProducts.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">Nenhum produto disponível</p>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {filteredProducts.map(renderProductCard)}
                    </div>
                  )}
                </>
              )}
            </AnimatedTabsContent>
          </AnimatedTabs>
        </div>
      </div>

      {/* Product Detail Modal */}
      <Dialog open={!!selectedProduct} onOpenChange={(open) => !open && setSelectedProduct(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-background border-accent">
          {selectedProduct && (
            <div className="space-y-4">
              <Button
                variant="ghost"
                onClick={() => setSelectedProduct(null)}
                className="text-accent hover:text-accent/80"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Voltar para a página inicial
              </Button>

              <div className="grid md:grid-cols-2 gap-6">
                {/* Product Image + Description */}
                <div className="space-y-4">
                  <div className="rounded-xl overflow-hidden border-2 border-accent/30">
                    <img 
                      src={getProductImage(selectedProduct.image_url)} 
                      alt={selectedProduct.name}
                      className="w-full h-auto block"
                      style={{ transform: 'scaleX(1.05)', transformOrigin: 'left' }}
                    />
                  </div>
                  
                  {/* Description - right below image */}
                  <div>
                    <h3 className="text-lg font-bold mb-3">Descrição do produto</h3>
                    <div className="whitespace-pre-wrap text-muted-foreground">
                      {selectedProduct.description}
                    </div>

                    <div className="mt-4 space-y-4">
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
                </div>

                {/* Product Info + Specs */}
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
                      <span className="text-xl font-bold text-green-500">$</span>
                      <span>Pagamento via PIX</span>
                    </div>
                  </div>

                  {/* Specifications */}
                  <div className="pt-4">
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
              </div>

              {/* Similar Products */}
              {similarProducts.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-lg font-bold mb-4 text-center">Produtos similares</h3>
                  <div className="flex justify-center gap-4 flex-wrap">
                    {similarProducts.slice(0, 3).map(p => (
                      <Card 
                        key={p.id} 
                        className="bg-secondary border-accent/30 cursor-pointer hover:border-accent overflow-hidden w-48"
                        onClick={() => {
                          setSelectedProduct(p);
                          setQuantity(1);
                        }}
                      >
                        <img 
                          src={getProductImage(p.image_url)} 
                          alt={p.name}
                          className="w-full h-auto object-cover"
                          style={{ transform: 'scaleX(1.05)', transformOrigin: 'left' }}
                        />
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

      {/* Insufficient Balance Modal */}
      <InsufficientBalanceModal
        open={insufficientBalanceOpen}
        onOpenChange={setInsufficientBalanceOpen}
        onRecharge={() => setRechargeOpen(true)}
        requiredAmount={requiredAmount}
        currentBalance={balance}
      />

      <RechargeModal 
        open={rechargeOpen} 
        onOpenChange={setRechargeOpen}
        onSuccess={(newBalance) => setBalance(newBalance)}
      />
    </>
  );
};

// Embedded SMS Bot component (without header and wallet)
const SMSBotEmbed = () => {
  const { user } = useAuth();
  const [countries, setCountries] = useState<any[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<any>(null);
  const [services, setServices] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingCountries, setLoadingCountries] = useState(true);
  const [loadingServices, setLoadingServices] = useState(false);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [buyingService, setBuyingService] = useState<string | null>(null);
  const [pollingOrders, setPollingOrders] = useState<Set<string>>(new Set());
  const [serviceQuantities, setServiceQuantities] = useState<Record<string, number>>({});
  const [activeSubTab, setActiveSubTab] = useState("buy");

  useEffect(() => {
    loadCountries();
    loadOrders();
  }, [user]);

  useEffect(() => {
    if (selectedCountry) {
      loadServices(selectedCountry.code);
    }
  }, [selectedCountry]);

  const loadCountries = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('sms-get-services', {
        body: { action: 'getCountries' }
      });
      if (error) throw error;
      setCountries(data.countries || []);
      const brazil = data.countries?.find((c: any) => c.code === '73');
      if (brazil) setSelectedCountry(brazil);
    } catch (err) {
      console.error('Error loading countries:', err);
    } finally {
      setLoadingCountries(false);
    }
  };

  const loadServices = async (countryCode: string) => {
    setLoadingServices(true);
    try {
      const { data, error } = await supabase.functions.invoke('sms-get-services', {
        body: { action: 'getServices', country: countryCode }
      });
      if (error) throw error;
      setServices(data.services || []);
    } catch (err) {
      console.error('Error loading services:', err);
    } finally {
      setLoadingServices(false);
    }
  };

  const loadOrders = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('sms_orders')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    setOrders(data || []);
    setLoadingOrders(false);
  };

  const updateQuantity = (serviceCode: string, quantity: number) => {
    setServiceQuantities(prev => ({ ...prev, [serviceCode]: Math.max(1, quantity) }));
  };
  const getQuantity = (serviceCode: string) => serviceQuantities[serviceCode] || 1;

  const buyNumber = async (service: any) => {
    if (!selectedCountry) return;
    const quantity = getQuantity(service.code);
    if (quantity > service.available) {
      toast.error(`Apenas ${service.available} números disponíveis`);
      return;
    }
    setBuyingService(service.code);
    try {
      const { data, error } = await supabase.functions.invoke('sms-buy-number', {
        body: { serviceCode: service.code, serviceName: service.name, country: selectedCountry.code, quantity }
      });
      if (error) throw error;
      if (data.error) {
        toast.error(data.error);
        return;
      }
      toast.success(quantity > 1 ? `${quantity} números adquiridos!` : "Número adquirido!");
      setServiceQuantities(prev => ({ ...prev, [service.code]: 1 }));
      loadOrders();
      setActiveSubTab("orders");
    } catch (err: any) {
      toast.error(err.message || "Erro ao comprar número");
    } finally {
      setBuyingService(null);
    }
  };

  const checkStatus = async (order: any) => {
    setPollingOrders(prev => new Set(prev).add(order.id));
    try {
      const { data } = await supabase.functions.invoke('sms-check-status', {
        body: { orderId: order.id, smsActivateId: order.sms_activate_id }
      });
      if (data?.status === 'received') {
        toast.success("SMS recebido!");
        loadOrders();
      }
    } finally {
      setPollingOrders(prev => { const n = new Set(prev); n.delete(order.id); return n; });
    }
  };

  const cancelOrder = async (order: any) => {
    try {
      const { data, error } = await supabase.functions.invoke('sms-cancel-order', {
        body: { orderId: order.id, smsActivateId: order.sms_activate_id }
      });
      if (error) throw error;
      if (!data.success) {
        toast.error(data.error || "Erro ao cancelar");
        return;
      }
      toast.success(`Cancelado. Reembolso: R$ ${data.refundAmount.toFixed(2)}`);
      loadOrders();
    } catch (err: any) {
      toast.error(err.message || "Erro ao cancelar");
    }
  };

  const filteredServices = services.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-4 md:p-6">
      <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="buy">Comprar Número</TabsTrigger>
          <TabsTrigger value="orders">
            Meus Pedidos
            {orders.filter(o => o.status === 'waiting_sms').length > 0 && (
              <Badge className="ml-2 bg-accent">{orders.filter(o => o.status === 'waiting_sms').length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="buy" className="space-y-4">
          <Card className="border-border">
            <CardContent className="p-4">
              <h3 className="font-bold mb-3">1. Escolha o país</h3>
              {loadingCountries ? (
                <div className="flex justify-center p-4"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {countries.map(country => (
                    <Button
                      key={country.code}
                      variant={selectedCountry?.code === country.code ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedCountry(country)}
                      className={selectedCountry?.code === country.code ? "bg-accent" : ""}
                    >
                      {country.flag} {country.name}
                    </Button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardContent className="p-4">
              <h3 className="font-bold mb-3">2. Escolha o serviço</h3>
              <AnimatedSearchBar
                placeholder="Buscar serviço..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                containerClassName="mb-3"
              />
              {loadingServices ? (
                <div className="flex justify-center p-4"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : (
                <div className="max-h-[400px] overflow-y-auto space-y-2">
                  {filteredServices.map(service => {
                    const quantity = getQuantity(service.code);
                    const displayPrice = service.priceWithMarkup ?? service.priceBrl ?? 0;
                    return (
                      <div key={service.code} className="flex flex-col md:flex-row md:items-center justify-between p-3 rounded-lg border border-border hover:border-accent gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{service.name}</p>
                          <p className="text-sm text-muted-foreground">{service.available} disponíveis</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-2 md:mt-0">
                          <Badge variant="secondary" className="bg-accent/20 text-accent">R$ {displayPrice.toFixed(2)}</Badge>
                          <div className="flex items-center gap-1">
                            <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => updateQuantity(service.code, quantity - 1)} disabled={quantity <= 1}>-</Button>
                            <span className="w-8 text-center">{quantity}</span>
                            <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => updateQuantity(service.code, quantity + 1)} disabled={quantity >= service.available}>+</Button>
                          </div>
                          <Button size="sm" onClick={() => buyNumber(service)} disabled={buyingService === service.code} className="bg-green-600 hover:bg-green-700 w-full md:w-auto">
                            {buyingService === service.code ? <Loader2 className="h-4 w-4 animate-spin" /> : "Comprar"}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="orders">
          <Card className="border-border">
            <CardContent className="p-4">
              {loadingOrders ? (
                <div className="flex justify-center p-4"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : orders.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Nenhum pedido encontrado</p>
              ) : (
                <div className="space-y-3">
                  {orders.map(order => (
                    <div key={order.id} className={`p-3 rounded-lg border-2 ${
                      order.status === 'received' 
                        ? 'border-green-500/50 bg-green-500/5' 
                        : order.status === 'cancelled'
                        ? 'border-red-500/50 bg-red-500/5'
                        : 'border-accent/50 bg-accent/5'
                    }`}>
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="font-medium">{order.service_name}</p>
                          <div 
                            className="flex items-center gap-2 text-lg font-mono cursor-pointer hover:text-accent"
                            onClick={() => {
                              if (order.phone_number) {
                                navigator.clipboard.writeText(order.phone_number);
                                toast.success("Número copiado!");
                              }
                            }}
                          >
                            {order.phone_number || "Aguardando..."}
                            {order.phone_number && <span className="text-xs">📋</span>}
                          </div>
                        </div>
                        <Badge className={
                          order.status === 'received' 
                            ? 'bg-green-500 text-white' 
                            : order.status === 'waiting_sms' 
                            ? 'bg-yellow-500 text-black' 
                            : order.status === 'cancelled'
                            ? 'bg-red-500 text-white'
                            : 'bg-muted'
                        }>
                          {order.status === 'received' 
                            ? 'Recebido' 
                            : order.status === 'waiting_sms' 
                            ? 'Aguardando' 
                            : order.status === 'cancelled'
                            ? 'Cancelado'
                            : order.status}
                        </Badge>
                      </div>
                      {order.sms_code && (
                        <div 
                          className="bg-green-500/20 p-2 rounded mb-2 cursor-pointer hover:bg-green-500/30"
                          onClick={() => {
                            navigator.clipboard.writeText(order.sms_code!);
                            toast.success("Código SMS copiado!");
                          }}
                        >
                          <p className="text-sm text-muted-foreground">Código SMS:</p>
                          <p className="text-xl font-bold text-green-500 flex items-center gap-2">
                            {order.sms_code}
                            <span className="text-sm">📋 Copiar</span>
                          </p>
                        </div>
                      )}
                      {order.status === 'received' && order.phone_number && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="mb-2 text-xs"
                          onClick={() => {
                            navigator.clipboard.writeText(order.phone_number!);
                            toast.success("Número copiado!");
                          }}
                        >
                          📋 Copiar Número
                        </Button>
                      )}
                      <div className="flex gap-2">
                        {order.status === 'waiting_sms' && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => checkStatus(order)} disabled={pollingOrders.has(order.id)}>
                              {pollingOrders.has(order.id) ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verificar"}
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => cancelOrder(order)}>Cancelar</Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

// Embedded SMM Panel component (without header and wallet)
const SMMPanelEmbed = () => {
  const { user } = useAuth();
  const [services, setServices] = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [orderLink, setOrderLink] = useState("");
  const [orderQuantity, setOrderQuantity] = useState<number>(100);
  const [selectedService, setSelectedService] = useState<any>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [customComments, setCustomComments] = useState("");
  const [activeSubTab, setActiveSubTab] = useState("services");

  useEffect(() => {
    fetchServices();
    fetchOrders();
  }, [user]);

  const fetchServices = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const response = await supabase.functions.invoke('smm-get-services', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (response.data?.success) {
        setServices(response.data.services);
        setCategories(response.data.categoriesPt);
      }
    } catch (err) {
      console.error('Error fetching services:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchOrders = async () => {
    if (!user) return;
    setLoadingOrders(true);
    const { data } = await supabase
      .from('smm_orders')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setOrders(data || []);
    setLoadingOrders(false);
  };

  const requiresCustomComments = (service: any) => {
    if (!service) return false;
    const name = service.nameOriginal?.toLowerCase() || service.name.toLowerCase();
    return name.includes('custom comment') || name.includes('personalizado');
  };

  const getCommentsCount = () => customComments.split('\n').filter(line => line.trim()).length;

  const handlePurchase = async () => {
    if (!selectedService || !orderLink || !orderQuantity) {
      toast.error("Preencha todos os campos");
      return;
    }
    if (orderQuantity < selectedService.min || orderQuantity > selectedService.max) {
      toast.error(`Quantidade entre ${selectedService.min} e ${selectedService.max}`);
      return;
    }
    if (requiresCustomComments(selectedService) && getCommentsCount() !== orderQuantity) {
      toast.error(`Insira exatamente ${orderQuantity} comentários`);
      return;
    }

    setPurchasing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Não autenticado');
      const priceUsd = (selectedService.rateUsd / 1000) * orderQuantity;
      const priceBrl = (selectedService.priceWithMarkup / 1000) * orderQuantity;
      const body: any = {
        serviceId: selectedService.id,
        serviceName: selectedService.name,
        category: selectedService.category,
        link: orderLink,
        quantity: orderQuantity,
        priceUsd,
        priceBrl,
      };
      if (requiresCustomComments(selectedService) && customComments.trim()) {
        body.comments = customComments;
      }
      const response = await supabase.functions.invoke('smm-create-order', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body,
      });
      if (response.data?.success) {
        toast.success("Pedido criado!");
        setSelectedService(null);
        setOrderLink("");
        setOrderQuantity(100);
        setCustomComments("");
        fetchOrders();
        setActiveSubTab("orders");
      } else {
        throw new Error(response.data?.error);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setPurchasing(false);
    }
  };

  const filteredServices = services.filter(s => {
    const matchesCategory = selectedCategory === "all" || s.categoryPt === selectedCategory;
    const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="p-4 md:p-6">
      <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="services">Serviços</TabsTrigger>
          <TabsTrigger value="orders">Meus Pedidos</TabsTrigger>
        </TabsList>

        <TabsContent value="services">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-accent" /></div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col md:flex-row gap-3">
                <AnimatedSearchBar
                  placeholder="Buscar serviço..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  containerClassName="flex-1"
                />
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="bg-background border border-border rounded-md px-3 py-2 w-full md:w-auto"
                >
                  <option value="all">Todas as categorias</option>
                  {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>

              {/* Quick category buttons */}
              <div className="flex flex-wrap justify-center gap-2">
                <Button
                  variant={selectedCategory === "Instagram Seguidores" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedCategory(selectedCategory === "Instagram Seguidores" ? "all" : "Instagram Seguidores")}
                  className={selectedCategory === "Instagram Seguidores" ? "bg-accent" : "border-accent/30"}
                >
                  Instagram Seguidores
                </Button>
                <Button
                  variant={selectedCategory === "Facebook Comentários" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedCategory(selectedCategory === "Facebook Comentários" ? "all" : "Facebook Comentários")}
                  className={selectedCategory === "Facebook Comentários" ? "bg-accent" : "border-accent/30"}
                >
                  Facebook Comentários
                </Button>
                <Button
                  variant={selectedCategory === "Instagram Curtidas" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedCategory(selectedCategory === "Instagram Curtidas" ? "all" : "Instagram Curtidas")}
                  className={selectedCategory === "Instagram Curtidas" ? "bg-accent" : "border-accent/30"}
                >
                  Instagram Curtidas
                </Button>
                <Button
                  variant={selectedCategory === "Facebook Curtidas de Post" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedCategory(selectedCategory === "Facebook Curtidas de Post" ? "all" : "Facebook Curtidas de Post")}
                  className={selectedCategory === "Facebook Curtidas de Post" ? "bg-accent" : "border-accent/30"}
                >
                  Facebook Curtidas de Post
                </Button>
              </div>

              {selectedService && (
                <Card className="border-green-500/50 bg-green-500/5">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex justify-between">
                      <div>
                        <p className="font-bold">{selectedService.name}</p>
                        <Badge variant="secondary">{selectedService.categoryPt}</Badge>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setSelectedService(null)}><X className="h-4 w-4" /></Button>
                    </div>
                    <Input placeholder="Cole o link aqui" value={orderLink} onChange={(e) => setOrderLink(e.target.value)} />
                    <Input type="number" placeholder="Quantidade" value={orderQuantity} onChange={(e) => setOrderQuantity(parseInt(e.target.value))} min={selectedService.min} max={selectedService.max} />
                    {requiresCustomComments(selectedService) && (
                      <textarea
                        placeholder={`Insira ${orderQuantity} comentários, um por linha`}
                        value={customComments}
                        onChange={(e) => setCustomComments(e.target.value)}
                        className="w-full bg-background border border-border rounded-md p-2 min-h-[100px]"
                      />
                    )}
                    <div className="flex justify-between items-center">
                      <p className="font-bold text-accent">Total: R$ {((selectedService.priceWithMarkup / 1000) * orderQuantity).toFixed(2)}</p>
                      <Button onClick={handlePurchase} disabled={purchasing} className="bg-green-600 hover:bg-green-700">
                        {purchasing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Comprar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="max-h-[500px] overflow-y-auto space-y-2">
                {filteredServices.map(service => (
                  <div
                    key={service.id}
                    className="p-3 rounded-lg border border-border hover:border-accent cursor-pointer"
                    onClick={() => {
                      setSelectedService(service);
                      setOrderQuantity(service.min);
                    }}
                  >
                    <div className="flex justify-between">
                      <div>
                        <p className="font-medium">{service.name}</p>
                        <p className="text-xs text-muted-foreground">{service.categoryPt}</p>
                      </div>
                      <Badge className="bg-accent/20 text-accent">R$ {(service.priceWithMarkup / 1000).toFixed(4)}/un</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="orders">
          {loadingOrders ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>
          ) : orders.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">Nenhum pedido encontrado</p>
          ) : (
            <div className="space-y-3">
              {orders.map(order => (
                <Card key={order.id} className="border-border">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium">{order.service_name}</p>
                        <p className="text-sm text-muted-foreground">{order.quantity} unidades</p>
                      </div>
                      <Badge className={order.status === 'concluído' ? 'bg-green-500' : order.status === 'processando' ? 'bg-blue-500' : 'bg-yellow-500'}>
                        {order.status}
                      </Badge>
                    </div>
                    {order.start_count !== null && order.remains !== null && (
                      <div className="mt-2">
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-accent"
                            style={{ width: `${((order.quantity - (order.remains || 0)) / order.quantity) * 100}%` }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {order.quantity - (order.remains || 0)} / {order.quantity}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Marketplace;
