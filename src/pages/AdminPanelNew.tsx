import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Copy, Star, ExternalLink, ChevronDown, ChevronRight, ArrowUpDown, Filter, Search, X, Key, Loader2, 
  UserPlus, Activity, Megaphone, Eye, MousePointer, Trash2, Image, Clock, Settings, Users, 
  BarChart3, Phone, FileText, Wallet, History, Percent, Menu, ShoppingBag, Package
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { MarketplaceProductModal } from "@/components/MarketplaceProductModal";

// Product image imports for admin
import bmVerificadaImg from "@/assets/bm-verificada.png";
import bmSimplesImg from "@/assets/bm-simples.png";
import perfilAntigoRealImg from "@/assets/perfil-antigo-real.png";
import perfilComumImg from "@/assets/perfil-comum.png";
import perfilReestabelecidoImg from "@/assets/perfil-reestabelecido.png";
import perfilVerificadoImg from "@/assets/perfil-verificado.png";
import comboMasterImg from "@/assets/combo-master.png";
import comboDiamondImg from "@/assets/combo-diamond.png";

const ADMIN_IMAGE_MAP: Record<string, string> = {
  "/assets/bm-verificada.png": bmVerificadaImg,
  "/assets/bm-simples.png": bmSimplesImg,
  "/assets/perfil-antigo-real.png": perfilAntigoRealImg,
  "/assets/perfil-comum.png": perfilComumImg,
  "/assets/perfil-reestabelecido.png": perfilReestabelecidoImg,
  "/assets/perfil-verificado.png": perfilVerificadoImg,
  "/assets/combo-master.png": comboMasterImg,
  "/assets/combo-diamond.png": comboDiamondImg,
};

const getAdminProductImage = (imageUrl: string | null) => {
  if (!imageUrl) return "";
  return ADMIN_IMAGE_MAP[imageUrl] || imageUrl;
};

type AdminOfferStatus = 'minerada' | 'ruim' | 'boa' | null;
type AnnouncementRedirectType = 'none' | 'custom_link' | 'system';

// Sistemas disponíveis para redirecionamento
const SYSTEMS = [
  { id: "metricas", name: "Sistema de Métricas", emoji: "📊" },
  { id: "organizador-numeros", name: "Organizador de Números", emoji: "📱" },
  { id: "track-ofertas", name: "Track Ofertas", emoji: "🎯" },
  { id: "criador-funil", name: "Criador de Funil", emoji: "💬" },
  { id: "gerador-criativos-imagem", name: "Gerador de Criativos em Imagem", emoji: "🖼️" },
  { id: "gerador-criativos-video", name: "Gerador de Criativos em Vídeo", emoji: "🎬" },
  { id: "gerador-audio", name: "Gerador de Áudio", emoji: "🎙️" },
  { id: "transcricao-audio", name: "Transcrição de Áudio", emoji: "📝" },
  { id: "zap-spy", name: "Zap Spy", emoji: "🔍" },
  { id: "tag-whats", name: "Tag Whats", emoji: "📲" },
  { id: "painel-marketing", name: "Painel Marketing", emoji: "📈" },
  { id: "numeros-virtuais", name: "Números Virtuais", emoji: "📞" },
];

// Sidebar menu structure
const SIDEBAR_MENU = [
  {
    category: "Usuários",
    icon: Users,
    items: [
      { id: "metrics", label: "Métricas", icon: BarChart3 },
      { id: "numbers", label: "Números", icon: Phone },
      { id: "offers", label: "Ofertas", icon: FileText },
      { id: "activities", label: "Atividades", icon: Activity },
    ]
  },
  {
    category: "Financeiro",
    icon: Wallet,
    items: [
      { id: "wallets", label: "Carteiras", icon: Wallet },
      { id: "transactions", label: "Histórico", icon: History },
    ]
  },
  {
    category: "Marketplace",
    icon: ShoppingBag,
    items: [
      { id: "wallets", label: "Carteiras", icon: Wallet },
      { id: "transactions", label: "Histórico", icon: History },
      { id: "margins", label: "Margens de Lucro", icon: Percent },
      { id: "marketplace-products", label: "Produtos", icon: Package },
      { id: "marketplace-sales", label: "Vendas de Ativos", icon: ShoppingBag },
    ]
  },
  {
    category: "Configurações",
    icon: Settings,
    items: [
      { id: "passwords", label: "Senhas", icon: Key },
      { id: "create-user", label: "Criar Usuário", icon: UserPlus },
      { id: "announcements", label: "Avisos", icon: Megaphone },
    ]
  },
];

interface AnnouncementData {
  id: string;
  title: string | null;
  content: string;
  image_url: string | null;
  redirect_type: AnnouncementRedirectType;
  redirect_url: string | null;
  redirect_system: string | null;
  redirect_button_text: string | null;
  is_active: boolean;
  views_count: number;
  clicks_count: number;
  created_at: string;
  scheduled_at: string | null;
}

interface UserData {
  id: string;
  email: string;
  username: string;
  totalInvested: number;
  isFavorite: boolean;
}

interface NumberData {
  id: string;
  user_id: string;
  user_email: string;
  numero: string;
  celular: string;
  status: string;
  operacao: string;
}

interface ProductData {
  id: string;
  user_id: string;
  user_email: string;
  product_name: string;
  last_update: string;
}

interface MetricData {
  id: string;
  product_id: string;
  product_name: string;
  user_id: string;
  user_email: string;
  date: string;
  invested: number;
  leads: number;
  pix_count: number;
  pix_total: number;
  cpl: number;
  conversion: number;
  result: number;
  roas: number;
  structure: string;
}

interface OfferData {
  id: string;
  name: string;
  ad_library_link: string;
  admin_status: AdminOfferStatus;
  created_at: string;
}

interface ActivityData {
  id: string;
  user_id: string;
  user_email: string;
  username: string;
  activity_type: string;
  activity_name: string;
  created_at: string;
}

interface WalletData {
  user_id: string;
  user_email: string;
  username: string;
  balance: number;
}

interface TransactionData {
  id: string;
  user_id: string;
  user_email: string;
  username: string;
  type: string;
  amount: number;
  description: string | null;
  created_at: string;
}

interface MarketplaceProductData {
  id: string;
  name: string;
  description: string;
  category: string;
  price: number;
  compare_price: number | null;
  discount_percent: number | null;
  stock: number | null;
  is_sold_out: boolean;
  image_url: string | null;
  sold_count: number | null;
}

interface MarketplaceOrderData {
  id: string;
  user_id: string;
  product_name: string;
  quantity: number;
  total_price: number;
  customer_name: string | null;
  customer_whatsapp: string | null;
  status: string;
  created_at: string;
}

const AdminPanelNew = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserData[]>([]);
  const [numbers, setNumbers] = useState<NumberData[]>([]);
  const [products, setProducts] = useState<ProductData[]>([]);
  const [metrics, setMetrics] = useState<MetricData[]>([]);
  const [offers, setOffers] = useState<OfferData[]>([]);
  const [activities, setActivities] = useState<ActivityData[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [wallets, setWallets] = useState<WalletData[]>([]);
  const [transactions, setTransactions] = useState<TransactionData[]>([]);
  const [marketplaceProducts, setMarketplaceProducts] = useState<MarketplaceProductData[]>([]);
  const [marketplaceOrders, setMarketplaceOrders] = useState<MarketplaceOrderData[]>([]);
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<MarketplaceProductData | null>(null);
  // Sidebar state
  const [activeSection, setActiveSection] = useState("metrics");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // UI State for hierarchical navigation
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [expandedUserNumbers, setExpandedUserNumbers] = useState<string | null>(null);
  
  // Modal state for product metrics
  const [selectedProductForMetrics, setSelectedProductForMetrics] = useState<{id: string; name: string} | null>(null);

  // Wallet management
  const [selectedWalletUser, setSelectedWalletUser] = useState<WalletData | null>(null);
  const [walletAmount, setWalletAmount] = useState("");
  const [walletDescription, setWalletDescription] = useState("");
  const [updatingWallet, setUpdatingWallet] = useState(false);

  // Margins state (in percentage, e.g., 30 = 30%)
  const [smsMargin, setSmsMargin] = useState("30");
  const [smmMargin, setSmmMargin] = useState("30");
  const [savingMargins, setSavingMargins] = useState(false);

  // Offers sorting and filtering
  const [offerSortBy, setOfferSortBy] = useState<'recent' | 'status'>('recent');
  const [offerStatusFilter, setOfferStatusFilter] = useState<string>('all');
  const [offerLinkSearch, setOfferLinkSearch] = useState("");
  
  // Search and sorting for users
  const [userSearch, setUserSearch] = useState("");
  const [userSortBy, setUserSortBy] = useState<'name' | 'invested' | 'favorites'>('name');

  // Password reset state
  const [resetEmail, setResetEmail] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resettingPassword, setResettingPassword] = useState(false);

  // Create user state
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("123456");
  const [creatingUser, setCreatingUser] = useState(false);

  // Announcements state
  const [announcements, setAnnouncements] = useState<AnnouncementData[]>([]);
  const [newAnnouncementTitle, setNewAnnouncementTitle] = useState("");
  const [newAnnouncementContent, setNewAnnouncementContent] = useState("");
  const [newAnnouncementImage, setNewAnnouncementImage] = useState<string | null>(null);
  const [newAnnouncementRedirectType, setNewAnnouncementRedirectType] = useState<AnnouncementRedirectType>("none");
  const [newAnnouncementRedirectUrl, setNewAnnouncementRedirectUrl] = useState("");
  const [newAnnouncementButtonText, setNewAnnouncementButtonText] = useState("");
  const [newAnnouncementSystems, setNewAnnouncementSystems] = useState<string[]>([]);
  const [uploadingAnnouncementImage, setUploadingAnnouncementImage] = useState(false);
  const [creatingAnnouncement, setCreatingAnnouncement] = useState(false);
  const [showAnnouncementPreview, setShowAnnouncementPreview] = useState(false);
  const [newAnnouncementScheduled, setNewAnnouncementScheduled] = useState(false);
  const [newAnnouncementScheduleDate, setNewAnnouncementScheduleDate] = useState("");
  const [newAnnouncementScheduleTime, setNewAnnouncementScheduleTime] = useState("");

  useEffect(() => {
    const initData = async () => {
      await loadAllData();
      loadAnnouncements();
      loadMargins();
      loadMarketplaceData();
    };
    initData();
  }, [user]);

  // Reload wallets when users are loaded
  useEffect(() => {
    if (users.length > 0) {
      loadWalletsAndTransactions();
    }
  }, [users]);

  const loadAllData = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-get-all-data");
      
      if (error) throw error;

      // Load favorites
      const { data: favoritesData } = await supabase
        .from("admin_favorite_users")
        .select("user_id");
      
      const favSet = new Set(favoritesData?.map(f => f.user_id) || []);
      setFavorites(favSet);

      // Load metrics from edge function data
      if (data.metrics) {
        setMetrics(data.metrics);
      }

      // Users already come with totalInvested from the API
      const usersWithFavorites = (data.users || []).map((u: any) => ({
        ...u,
        isFavorite: favSet.has(u.id)
      }));

      setUsers(usersWithFavorites);
      setNumbers(data.numbers || []);
      setProducts(data.products || []);
      setOffers(data.offers || []);
      setActivities(data.activities || []);
    } catch (err) {
      console.error("Error loading admin data:", err);
      toast.error("Erro ao carregar dados administrativos");
    } finally {
      setLoading(false);
    }
  };

  const loadWalletsAndTransactions = async () => {
    try {
      // Load all wallets
      const { data: walletsData, error: walletsError } = await supabase
        .from("sms_user_wallets")
        .select("*")
        .order("balance", { ascending: false });

      if (walletsError) throw walletsError;

      // Load all transactions
      const { data: transactionsData, error: transactionsError } = await supabase
        .from("sms_transactions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);

      if (transactionsError) throw transactionsError;

      // Get user info for wallets and transactions
      const userIds = new Set<string>();
      walletsData?.forEach(w => userIds.add(w.user_id));
      transactionsData?.forEach(t => userIds.add(t.user_id));

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username")
        .in("id", Array.from(userIds));

      const profileMap = new Map(profiles?.map(p => [p.id, p.username]) || []);

      // Find emails from users state
      const userMap = new Map(users.map(u => [u.id, u.email]));

      setWallets(walletsData?.map(w => ({
        user_id: w.user_id,
        user_email: userMap.get(w.user_id) || w.user_id,
        username: profileMap.get(w.user_id) || userMap.get(w.user_id) || w.user_id,
        balance: Number(w.balance),
      })) || []);

      setTransactions(transactionsData?.map(t => ({
        id: t.id,
        user_id: t.user_id,
        user_email: userMap.get(t.user_id) || t.user_id,
        username: profileMap.get(t.user_id) || userMap.get(t.user_id) || t.user_id,
        type: t.type,
        amount: Number(t.amount),
        description: t.description,
        created_at: t.created_at,
      })) || []);
    } catch (err) {
      console.error("Error loading wallets:", err);
    }
  };

  const loadMargins = async () => {
    try {
      const { data, error } = await supabase
        .from('platform_margins')
        .select('system_name, margin_percent');
      
      if (error) throw error;
      
      data?.forEach((margin) => {
        if (margin.system_name === 'sms') setSmsMargin(String(margin.margin_percent));
        if (margin.system_name === 'smm') setSmmMargin(String(margin.margin_percent));
      });
    } catch (err) {
      console.error("Error loading margins:", err);
    }
  };

  const saveMargins = async () => {
    if (!user) return;
    setSavingMargins(true);
    try {
      // Update SMS margin
      const { error: smsError } = await supabase
        .from('platform_margins')
        .update({ margin_percent: parseFloat(smsMargin), updated_by: user.id })
        .eq('system_name', 'sms');
      
      if (smsError) throw smsError;
      
      // Update SMM margin
      const { error: smmError } = await supabase
        .from('platform_margins')
        .update({ margin_percent: parseFloat(smmMargin), updated_by: user.id })
        .eq('system_name', 'smm');
      
      if (smmError) throw smmError;
      
      toast.success("Margens salvas com sucesso!");
    } catch (err) {
      console.error("Error saving margins:", err);
      toast.error("Erro ao salvar margens");
    } finally {
      setSavingMargins(false);
    }
  };

  const loadMarketplaceData = async () => {
    try {
      // Load marketplace products
      const { data: productsData, error: productsError } = await supabase
        .from("marketplace_products")
        .select("*")
        .order("created_at", { ascending: false });

      if (productsError) throw productsError;
      setMarketplaceProducts(productsData || []);

      // Load marketplace orders
      const { data: ordersData, error: ordersError } = await supabase
        .from("marketplace_orders")
        .select("*")
        .order("created_at", { ascending: false });

      if (ordersError) throw ordersError;
      setMarketplaceOrders(ordersData || []);
    } catch (err) {
      console.error("Error loading marketplace data:", err);
    }
  };

  const deleteMarketplaceProduct = async (productId: string) => {
    try {
      const { error } = await supabase
        .from("marketplace_products")
        .delete()
        .eq("id", productId);

      if (error) throw error;
      toast.success("Produto excluído");
      loadMarketplaceData();
    } catch (err) {
      console.error("Error deleting product:", err);
      toast.error("Erro ao excluir produto");
    }
  };

  const loadAnnouncements = async () => {
    try {
      const { data, error } = await supabase
        .from("admin_announcements")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setAnnouncements((data || []) as AnnouncementData[]);
    } catch (err) {
      console.error("Error loading announcements:", err);
    }
  };

  const updateUserWallet = async (isAdd: boolean) => {
    if (!selectedWalletUser || !walletAmount) return;
    
    const amount = parseFloat(walletAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Valor inválido");
      return;
    }

    setUpdatingWallet(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (!token) {
        toast.error("Sessão expirada");
        return;
      }

      const { data, error } = await supabase.functions.invoke("sms-admin-recharge", {
        body: { 
          targetUserId: selectedWalletUser.user_id, 
          amount: isAdd ? amount : -amount,
          description: walletDescription || (isAdd ? "Adição manual pelo admin" : "Remoção manual pelo admin")
        },
        headers: { Authorization: `Bearer ${token}` },
      });

      if (error) throw error;
      
      toast.success(isAdd ? "Saldo adicionado!" : "Saldo removido!");
      setSelectedWalletUser(null);
      setWalletAmount("");
      setWalletDescription("");
      loadWalletsAndTransactions();
    } catch (err: any) {
      console.error("Error updating wallet:", err);
      toast.error(err?.message || "Erro ao atualizar carteira");
    } finally {
      setUpdatingWallet(false);
    }
  };

  // Handle image paste for announcements
  const handleAnnouncementImagePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;

        setUploadingAnnouncementImage(true);
        try {
          const fileName = `announcement-${Date.now()}.${file.type.split('/')[1]}`;
          const { data, error } = await supabase.storage
            .from('announcement-images')
            .upload(fileName, file);

          if (error) throw error;

          const { data: urlData } = supabase.storage
            .from('announcement-images')
            .getPublicUrl(data.path);

          setNewAnnouncementImage(urlData.publicUrl);
          toast.success("Imagem colada com sucesso!");
        } catch (err) {
          console.error("Error uploading image:", err);
          toast.error("Erro ao fazer upload da imagem");
        } finally {
          setUploadingAnnouncementImage(false);
        }
        break;
      }
    }
  }, []);

  const createAnnouncement = async () => {
    if (!newAnnouncementContent.trim()) {
      toast.error("O conteúdo do aviso é obrigatório");
      return;
    }

    // Validar agendamento
    let scheduledAt: string | null = null;
    if (newAnnouncementScheduled) {
      if (!newAnnouncementScheduleDate || !newAnnouncementScheduleTime) {
        toast.error("Preencha a data e hora do agendamento");
        return;
      }
      scheduledAt = `${newAnnouncementScheduleDate}T${newAnnouncementScheduleTime}:00`;
    }

    setCreatingAnnouncement(true);
    try {
      const announcementData = {
        created_by: user?.id,
        title: newAnnouncementTitle.trim() || null,
        content: newAnnouncementContent.trim(),
        image_url: newAnnouncementImage,
        redirect_type: newAnnouncementRedirectType,
        redirect_url: newAnnouncementRedirectType === 'custom_link' ? newAnnouncementRedirectUrl.trim() : null,
        redirect_system: newAnnouncementRedirectType === 'system' ? newAnnouncementSystems.join(",") : null,
        redirect_button_text: newAnnouncementRedirectType === 'custom_link' ? newAnnouncementButtonText.trim() || null : null,
        scheduled_at: scheduledAt,
        is_active: !newAnnouncementScheduled,
      };

      const { error } = await supabase
        .from("admin_announcements")
        .insert(announcementData);

      if (error) throw error;

      toast.success(newAnnouncementScheduled 
        ? "Aviso agendado com sucesso!" 
        : "Aviso publicado com sucesso!");
      
      setNewAnnouncementTitle("");
      setNewAnnouncementContent("");
      setNewAnnouncementImage(null);
      setNewAnnouncementRedirectType("none");
      setNewAnnouncementRedirectUrl("");
      setNewAnnouncementButtonText("");
      setNewAnnouncementSystems([]);
      setNewAnnouncementScheduled(false);
      setNewAnnouncementScheduleDate("");
      setNewAnnouncementScheduleTime("");
      
      loadAnnouncements();
    } catch (err) {
      console.error("Error creating announcement:", err);
      toast.error("Erro ao criar aviso");
    } finally {
      setCreatingAnnouncement(false);
    }
  };

  const toggleAnnouncementActive = async (id: string, currentActive: boolean) => {
    try {
      const { error } = await supabase
        .from("admin_announcements")
        .update({ is_active: !currentActive })
        .eq("id", id);

      if (error) throw error;
      toast.success(currentActive ? "Aviso desativado" : "Aviso ativado");
      loadAnnouncements();
    } catch (err) {
      console.error("Error toggling announcement:", err);
      toast.error("Erro ao alterar status do aviso");
    }
  };

  const deleteAnnouncement = async (id: string) => {
    try {
      const { error } = await supabase
        .from("admin_announcements")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Aviso excluído");
      loadAnnouncements();
    } catch (err) {
      console.error("Error deleting announcement:", err);
      toast.error("Erro ao excluir aviso");
    }
  };

  const toggleSystemSelection = (systemId: string) => {
    setNewAnnouncementSystems(prev => 
      prev.includes(systemId) 
        ? prev.filter(s => s !== systemId)
        : [...prev, systemId]
    );
  };

  const toggleFavorite = async (userId: string) => {
    try {
      if (favorites.has(userId)) {
        const { error } = await supabase
          .from("admin_favorite_users")
          .delete()
          .eq("user_id", userId);
        if (error) throw error;
        setFavorites(prev => {
          const next = new Set(prev);
          next.delete(userId);
          return next;
        });
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, isFavorite: false } : u));
      } else {
        const { error } = await supabase
          .from("admin_favorite_users")
          .insert({ user_id: userId, created_by: user?.id });
        if (error) throw error;
        setFavorites(prev => new Set(prev).add(userId));
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, isFavorite: true } : u));
      }
      toast.success("Favorito atualizado");
    } catch (err) {
      console.error("Error toggling favorite:", err);
      toast.error("Erro ao atualizar favorito");
    }
  };

  const updateOfferStatus = async (offerId: string, status: AdminOfferStatus) => {
    try {
      const { error } = await supabase
        .from("tracked_offers")
        .update({ admin_status: status })
        .eq("id", offerId);

      if (error) throw error;

      setOffers(prev => prev.map(o => 
        o.id === offerId ? { ...o, admin_status: status } : o
      ));
      
      toast.success("Status atualizado");
    } catch (err) {
      console.error("Error updating offer status:", err);
      toast.error("Erro ao atualizar status");
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Link copiado!");
  };

  const resetUserPassword = async () => {
    if (!resetEmail.trim() || !resetPassword.trim()) {
      toast.error("Preencha email e senha");
      return;
    }

    setResettingPassword(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (!token) {
        toast.error("Você precisa estar logado para resetar senhas");
        return;
      }

      const { data, error } = await supabase.functions.invoke("reset-user-password", {
        body: { email: resetEmail.trim(), password: resetPassword.trim() },
        headers: { Authorization: `Bearer ${token}` },
      });

      if (error) {
        const errorMessage = data?.error || error.message || "Erro ao redefinir senha";
        throw new Error(errorMessage);
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      toast.success(data?.message || "Senha redefinida com sucesso!");
      setResetEmail("");
      setResetPassword("");
    } catch (err: any) {
      console.error("Error resetting password:", err);
      toast.error(err?.message || "Erro ao redefinir senha");
    } finally {
      setResettingPassword(false);
    }
  };

  const handleCreateUser = async () => {
    if (!newUserEmail.trim()) {
      toast.error("Preencha o email do usuário");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newUserEmail.trim())) {
      toast.error("Email inválido");
      return;
    }

    setCreatingUser(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (!token) {
        toast.error("Você precisa estar logado para criar usuários");
        return;
      }

      const { data, error } = await supabase.functions.invoke("batch-create-users", {
        body: { emails: [newUserEmail.trim().toLowerCase()], password: newUserPassword },
        headers: { Authorization: `Bearer ${token}` },
      });

      if (error) {
        const errorMessage = data?.error || error.message || "Erro ao criar usuário";
        throw new Error(errorMessage);
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      const results = data?.results || [];
      const created = results.filter((r: any) => r.status === 'created');
      const existing = results.filter((r: any) => r.status === 'exists');

      if (created.length > 0) {
        toast.success(`Usuário criado com sucesso! Senha: ${newUserPassword}`);
        setNewUserEmail("");
        loadAllData();
      } else if (existing.length > 0) {
        toast.warning("Este email já está cadastrado");
      } else {
        toast.error("Erro ao criar usuário");
      }
    } catch (err: any) {
      console.error("Error creating user:", err);
      toast.error(err?.message || "Erro ao criar usuário");
    } finally {
      setCreatingUser(false);
    }
  };

  const getStatusBadge = (status: AdminOfferStatus) => {
    switch (status) {
      case "boa":
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/50">Boa</Badge>;
      case "ruim":
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/50">Ruim</Badge>;
      case "minerada":
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/50">Minerada</Badge>;
      default:
        return <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/50">Sem status</Badge>;
    }
  };

  const getUserProducts = (userId: string) => {
    return products.filter(p => p.user_id === userId).map(p => ({
      id: p.id,
      name: p.product_name
    }));
  };

  const getProductMetrics = (productId: string) => {
    return metrics.filter(m => m.product_id === productId);
  };

  const getUserNumbers = (userEmail: string) => {
    return numbers.filter(n => n.user_email === userEmail);
  };

  // Filter and sort users
  const filteredUsers = useMemo(() => {
    let result = [...users];
    
    if (userSearch.trim()) {
      const search = userSearch.toLowerCase();
      result = result.filter(u => 
        u.username?.toLowerCase().includes(search) || 
        u.email?.toLowerCase().includes(search)
      );
    }
    
    if (userSortBy === 'invested') {
      result.sort((a, b) => b.totalInvested - a.totalInvested);
    } else if (userSortBy === 'favorites') {
      result.sort((a, b) => {
        if (favorites.has(a.id) && !favorites.has(b.id)) return -1;
        if (!favorites.has(a.id) && favorites.has(b.id)) return 1;
        return b.totalInvested - a.totalInvested;
      });
    } else {
      result.sort((a, b) => (a.username || a.email).localeCompare(b.username || b.email));
    }
    
    return result;
  }, [users, userSearch, userSortBy, favorites]);

  const getSortedFilteredOffers = () => {
    let filtered = [...offers];
    
    if (offerLinkSearch.trim()) {
      const search = offerLinkSearch.toLowerCase();
      filtered = filtered.filter(o => 
        o.ad_library_link.toLowerCase().includes(search) ||
        o.name.toLowerCase().includes(search)
      );
    }
    
    if (offerStatusFilter !== 'all') {
      if (offerStatusFilter === 'none') {
        filtered = filtered.filter(o => !o.admin_status);
      } else {
        filtered = filtered.filter(o => o.admin_status === offerStatusFilter);
      }
    }

    if (offerSortBy === 'recent') {
      filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (offerSortBy === 'status') {
      const statusOrder = { boa: 1, minerada: 2, ruim: 3, null: 4 };
      filtered.sort((a, b) => (statusOrder[a.admin_status || 'null'] || 4) - (statusOrder[b.admin_status || 'null'] || 4));
    }

    return filtered;
  };

  if (loading) {
    return (
      <>
        <Header />
        <div className="h-14 md:h-16" />
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
        </div>
      </>
    );
  }

  const renderContent = () => {
    switch (activeSection) {
      case "metrics":
        return (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <Search className="h-5 w-5 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou email..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="max-w-md"
              />
              <Select value={userSortBy} onValueChange={(v) => setUserSortBy(v as typeof userSortBy)}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Ordenar por" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Nome</SelectItem>
                  <SelectItem value="invested">Total Investido</SelectItem>
                  <SelectItem value="favorites">Favoritos</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-sm text-muted-foreground ml-auto">
                {filteredUsers.length} de {users.length} usuários
              </span>
            </div>
            {filteredUsers.map((u) => (
              <Card key={u.id} className="border-2 border-accent">
                <CardHeader 
                  className="cursor-pointer hover:bg-accent/5 transition-colors"
                  onClick={() => setExpandedUser(expandedUser === u.id ? null : u.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {expandedUser === u.id ? (
                        <ChevronDown className="h-5 w-5 text-accent" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-accent" />
                      )}
                      <div>
                        <CardTitle className="text-lg">{u.username || u.email}</CardTitle>
                        <p className="text-sm text-muted-foreground">
                          Total investido: <span className="text-accent font-semibold">R$ {u.totalInvested.toFixed(2)}</span>
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(u.id);
                      }}
                    >
                      <Star className={`h-5 w-5 ${favorites.has(u.id) ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'}`} />
                    </Button>
                  </div>
                </CardHeader>
                
                {expandedUser === u.id && (
                  <CardContent>
                    <div className="space-y-3 pl-8">
                      {getUserProducts(u.id).map((product) => (
                        <Card 
                          key={product.id} 
                          className="border border-border cursor-pointer hover:bg-accent/5 transition-colors"
                          onClick={() => setSelectedProductForMetrics({ id: product.id, name: product.name })}
                        >
                          <CardHeader className="py-3">
                            <div className="flex items-center gap-2">
                              <ChevronRight className="h-4 w-4 text-accent" />
                              <span className="font-medium">{product.name}</span>
                              <Badge variant="outline" className="ml-auto text-xs">
                                {getProductMetrics(product.id).length} métricas
                              </Badge>
                            </div>
                          </CardHeader>
                        </Card>
                      ))}
                      {getUserProducts(u.id).length === 0 && (
                        <p className="text-muted-foreground text-sm">Nenhum produto cadastrado</p>
                      )}
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        );

      case "numbers":
        return (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <Select value={userSortBy} onValueChange={(v) => setUserSortBy(v as typeof userSortBy)}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Ordenar por" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Nome</SelectItem>
                  <SelectItem value="invested">Total Investido</SelectItem>
                  <SelectItem value="favorites">Favoritos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {filteredUsers.map((u) => {
              const userNumbers = getUserNumbers(u.email);
              if (userNumbers.length === 0) return null;
              
              return (
                <Card key={u.id} className="border-2 border-accent">
                  <CardHeader 
                    className="cursor-pointer hover:bg-accent/5 transition-colors"
                    onClick={() => setExpandedUserNumbers(expandedUserNumbers === u.id ? null : u.id)}
                  >
                    <div className="flex items-center gap-3">
                      {expandedUserNumbers === u.id ? (
                        <ChevronDown className="h-5 w-5 text-accent" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-accent" />
                      )}
                      <div>
                        <CardTitle className="text-lg">{u.username || u.email}</CardTitle>
                        <p className="text-sm text-muted-foreground">
                          {userNumbers.length} número{userNumbers.length !== 1 ? 's' : ''} cadastrado{userNumbers.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                  </CardHeader>
                  
                  {expandedUserNumbers === u.id && (
                    <CardContent>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Número</TableHead>
                              <TableHead>Celular</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Operação</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {userNumbers.map((n) => (
                              <TableRow key={n.id}>
                                <TableCell>{n.numero}</TableCell>
                                <TableCell>{n.celular}</TableCell>
                                <TableCell>
                                  <Badge variant="outline">{n.status}</Badge>
                                </TableCell>
                                <TableCell>{n.operacao}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        );

      case "offers":
        return (
          <Card className="border-2 border-accent">
            <CardHeader>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <CardTitle>Ofertas</CardTitle>
                <div className="flex flex-wrap gap-2">
                  <div className="relative flex-1 md:flex-none">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por link ou nome..."
                      value={offerLinkSearch}
                      onChange={(e) => setOfferLinkSearch(e.target.value)}
                      className="pl-9 w-full md:w-64"
                    />
                    {offerLinkSearch && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6"
                        onClick={() => setOfferLinkSearch("")}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <Select value={offerSortBy} onValueChange={(v) => setOfferSortBy(v as 'recent' | 'status')}>
                    <SelectTrigger className="w-40">
                      <ArrowUpDown className="h-4 w-4 mr-2" />
                      <SelectValue placeholder="Ordenar" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="recent">Mais recentes</SelectItem>
                      <SelectItem value="status">Por status</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={offerStatusFilter} onValueChange={setOfferStatusFilter}>
                    <SelectTrigger className="w-40">
                      <Filter className="h-4 w-4 mr-2" />
                      <SelectValue placeholder="Filtrar status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="boa">Boa</SelectItem>
                      <SelectItem value="minerada">Minerada</SelectItem>
                      <SelectItem value="ruim">Ruim</SelectItem>
                      <SelectItem value="none">Sem status</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome da Oferta</TableHead>
                      <TableHead>Link</TableHead>
                      <TableHead>Status Admin</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {getSortedFilteredOffers().map((o) => (
                      <TableRow key={o.id}>
                        <TableCell className="font-medium">{o.name}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => copyToClipboard(o.ad_library_link)}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => window.open(o.ad_library_link, "_blank")}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={o.admin_status || "none"}
                            onValueChange={(v) => updateOfferStatus(o.id, v === "none" ? null : v as AdminOfferStatus)}
                          >
                            <SelectTrigger className="w-32">
                              {getStatusBadge(o.admin_status)}
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Sem status</SelectItem>
                              <SelectItem value="boa">Boa</SelectItem>
                              <SelectItem value="minerada">Minerada</SelectItem>
                              <SelectItem value="ruim">Ruim</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        );

      case "activities":
        return (
          <Card className="border-2 border-accent">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-accent" />
                Atividades dos Usuários
              </CardTitle>
              <CardDescription>
                Últimas atividades registradas na plataforma
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Usuário</TableHead>
                      <TableHead>Sistema</TableHead>
                      <TableHead>Data/Hora</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activities.slice(0, 100).map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium">{a.username || a.user_email}</TableCell>
                        <TableCell>{a.activity_name}</TableCell>
                        <TableCell>{new Date(a.created_at).toLocaleString('pt-BR')}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        );

      case "wallets":
        return (
          <Card className="border-2 border-accent">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-accent" />
                Carteiras dos Usuários
              </CardTitle>
              <CardDescription>
                Gerencie o saldo das carteiras
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Usuário</TableHead>
                      <TableHead>Saldo</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {wallets.map((w) => (
                      <TableRow key={w.user_id}>
                        <TableCell className="font-medium">{w.username || w.user_email}</TableCell>
                        <TableCell className="text-accent font-semibold">R$ {w.balance.toFixed(2)}</TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedWalletUser(w)}
                          >
                            <Wallet className="h-4 w-4 mr-2" />
                            Gerenciar
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        );

      case "transactions":
        return (
          <Card className="border-2 border-accent">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5 text-accent" />
                Histórico de Transações
              </CardTitle>
              <CardDescription>
                Todas as transações dos usuários
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Usuário</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Data</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium">{t.username || t.user_email}</TableCell>
                        <TableCell>
                          <Badge variant={t.type === 'recharge' ? 'default' : 'secondary'}>
                            {t.type === 'recharge' ? 'Recarga' : t.type === 'purchase' ? 'Compra' : t.type}
                          </Badge>
                        </TableCell>
                        <TableCell className={t.amount >= 0 ? 'text-green-500' : 'text-red-500'}>
                          {t.amount >= 0 ? '+' : ''}R$ {t.amount.toFixed(2)}
                        </TableCell>
                        <TableCell className="max-w-xs truncate">{t.description || '-'}</TableCell>
                        <TableCell>{new Date(t.created_at).toLocaleString('pt-BR')}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        );

      case "margins":
        return (
          <Card className="border-2 border-accent max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Percent className="h-5 w-5 text-accent" />
                Margens de Lucro
              </CardTitle>
              <CardDescription>
                Configure a porcentagem de lucro para cada sistema
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-base font-semibold">Números Virtuais (SMS)</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      step="1"
                      min="0"
                      max="200"
                      value={smsMargin}
                      onChange={(e) => setSmsMargin(e.target.value)}
                      placeholder="30"
                      className="flex-1"
                    />
                    <span className="text-lg font-bold text-accent">%</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Ex: 30 = preço aumenta 30%</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-base font-semibold">Painel Marketing (SMM)</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      step="1"
                      min="0"
                      max="200"
                      value={smmMargin}
                      onChange={(e) => setSmmMargin(e.target.value)}
                      placeholder="30"
                      className="flex-1"
                    />
                    <span className="text-lg font-bold text-accent">%</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Ex: 30 = preço aumenta 30%</p>
                </div>
              </div>

              <Button onClick={saveMargins} disabled={savingMargins} className="w-full">
                {savingMargins ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Settings className="mr-2 h-4 w-4" />
                    Salvar Margens
                  </>
                )}
              </Button>

              <div className="p-4 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground">
                  <strong>Fórmula:</strong> Preço USD × R$6.10 × (1 + margem%)
                </p>
              </div>
            </CardContent>
          </Card>
        );

      case "passwords":
        return (
          <Card className="border-2 border-accent max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5 text-accent" />
                Redefinir Senha de Usuário
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Email do usuário</label>
                <Input
                  type="email"
                  placeholder="usuario@email.com"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Nova senha</label>
                <Input
                  type="text"
                  placeholder="Nova senha"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                />
              </div>
              <Button 
                onClick={resetUserPassword}
                disabled={resettingPassword || !resetEmail.trim() || !resetPassword.trim()}
                className="w-full"
              >
                {resettingPassword ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Redefinindo...
                  </>
                ) : (
                  <>
                    <Key className="mr-2 h-4 w-4" />
                    Redefinir Senha
                  </>
                )}
              </Button>
              <p className="text-sm text-muted-foreground">
                A nova senha será aplicada imediatamente.
              </p>
            </CardContent>
          </Card>
        );

      case "create-user":
        return (
          <Card className="border-2 border-accent max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-accent" />
                Criar Novo Usuário
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Email do usuário</label>
                <Input
                  type="email"
                  placeholder="usuario@email.com"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Senha</label>
                <Input
                  type="text"
                  placeholder="Senha do usuário"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Padrão: 123456</p>
              </div>
              <Button 
                onClick={handleCreateUser}
                disabled={creatingUser || !newUserEmail.trim()}
                className="w-full"
              >
                {creatingUser ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Criando...
                  </>
                ) : (
                  <>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Criar Usuário
                  </>
                )}
              </Button>
              <p className="text-sm text-muted-foreground">
                O usuário poderá fazer login imediatamente.
              </p>
            </CardContent>
          </Card>
        );

      case "announcements":
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Create Announcement */}
            <Card className="border-2 border-accent">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Megaphone className="h-5 w-5 text-accent" />
                  Criar Novo Aviso
                </CardTitle>
                <CardDescription>
                  O aviso será exibido uma única vez para cada usuário
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Título (opcional)</Label>
                  <Input
                    placeholder="Título do aviso"
                    value={newAnnouncementTitle}
                    onChange={(e) => setNewAnnouncementTitle(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Conteúdo *</Label>
                  <Textarea
                    placeholder="Escreva o conteúdo do aviso..."
                    value={newAnnouncementContent}
                    onChange={(e) => setNewAnnouncementContent(e.target.value)}
                    onPaste={handleAnnouncementImagePaste}
                    rows={4}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Imagem (opcional) - Cole com Ctrl+V</Label>
                  <div 
                    className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:border-accent/50 transition-colors"
                    onPaste={handleAnnouncementImagePaste}
                    tabIndex={0}
                  >
                    {uploadingAnnouncementImage ? (
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        <span>Fazendo upload...</span>
                      </div>
                    ) : newAnnouncementImage ? (
                      <div className="relative">
                        <img 
                          src={newAnnouncementImage} 
                          alt="Preview" 
                          className="max-h-40 mx-auto rounded"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute top-0 right-0 h-6 w-6 bg-destructive/80 hover:bg-destructive"
                          onClick={() => setNewAnnouncementImage(null)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Image className="h-8 w-8" />
                        <span className="text-sm">Clique aqui e cole uma imagem (Ctrl+V)</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Tipo de Redirecionamento</Label>
                  <Select 
                    value={newAnnouncementRedirectType} 
                    onValueChange={(v) => setNewAnnouncementRedirectType(v as AnnouncementRedirectType)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum (apenas informativo)</SelectItem>
                      <SelectItem value="custom_link">Link personalizado</SelectItem>
                      <SelectItem value="system">Sistemas da plataforma</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {newAnnouncementRedirectType === 'custom_link' && (
                  <>
                    <div className="space-y-2">
                      <Label>URL do Link</Label>
                      <Input
                        placeholder="https://exemplo.com"
                        value={newAnnouncementRedirectUrl}
                        onChange={(e) => setNewAnnouncementRedirectUrl(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Texto do Botão (opcional)</Label>
                      <Input
                        placeholder="Acessar"
                        value={newAnnouncementButtonText}
                        onChange={(e) => setNewAnnouncementButtonText(e.target.value)}
                      />
                    </div>
                  </>
                )}

                {newAnnouncementRedirectType === 'system' && (
                  <div className="space-y-2">
                    <Label>Selecione os Sistemas</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {SYSTEMS.map(system => (
                        <div
                          key={system.id}
                          className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-colors ${
                            newAnnouncementSystems.includes(system.id)
                              ? 'border-accent bg-accent/10'
                              : 'border-border hover:border-accent/50'
                          }`}
                          onClick={() => toggleSystemSelection(system.id)}
                        >
                          <Checkbox
                            checked={newAnnouncementSystems.includes(system.id)}
                            onCheckedChange={() => toggleSystemSelection(system.id)}
                          />
                          <span className="text-lg">{system.emoji}</span>
                          <span className="text-sm truncate">{system.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Scheduling */}
                <div className="space-y-3 p-3 rounded-lg border border-border">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="schedule-announcement"
                      checked={newAnnouncementScheduled}
                      onCheckedChange={(checked) => setNewAnnouncementScheduled(checked === true)}
                    />
                    <Label htmlFor="schedule-announcement" className="cursor-pointer">
                      Agendar publicação
                    </Label>
                  </div>
                  
                  {newAnnouncementScheduled && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Data</Label>
                        <Input
                          type="date"
                          value={newAnnouncementScheduleDate}
                          onChange={(e) => setNewAnnouncementScheduleDate(e.target.value)}
                          min={new Date().toISOString().split('T')[0]}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Hora</Label>
                        <Input
                          type="time"
                          value={newAnnouncementScheduleTime}
                          onChange={(e) => setNewAnnouncementScheduleTime(e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowAnnouncementPreview(true)}
                    disabled={!newAnnouncementContent.trim()}
                    className="flex-1"
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    Visualizar
                  </Button>
                  <Button
                    onClick={createAnnouncement}
                    disabled={creatingAnnouncement || !newAnnouncementContent.trim()}
                    className="flex-1"
                  >
                    {creatingAnnouncement ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {newAnnouncementScheduled ? "Agendando..." : "Publicando..."}
                      </>
                    ) : (
                      <>
                        <Megaphone className="mr-2 h-4 w-4" />
                        {newAnnouncementScheduled ? "Agendar" : "Publicar"}
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Announcement History */}
            <Card className="border-2 border-accent">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-accent" />
                  Histórico de Avisos
                </CardTitle>
                <CardDescription>
                  {announcements.length} aviso{announcements.length !== 1 ? 's' : ''} cadastrado{announcements.length !== 1 ? 's' : ''}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  <div className="space-y-3 pr-4">
                    {announcements.map(announcement => (
                      <Card key={announcement.id} className={`border ${announcement.is_active ? 'border-green-500/50' : 'border-muted'}`}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              {announcement.title && (
                                <h4 className="font-semibold truncate">{announcement.title}</h4>
                              )}
                              <p className="text-sm text-muted-foreground line-clamp-2">
                                {announcement.content}
                              </p>
                              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Eye className="h-3 w-3" />
                                  {announcement.views_count}
                                </span>
                                <span className="flex items-center gap-1">
                                  <MousePointer className="h-3 w-3" />
                                  {announcement.clicks_count}
                                </span>
                                {announcement.views_count > 0 && (
                                  <span>
                                    ({((announcement.clicks_count / announcement.views_count) * 100).toFixed(1)}% CTR)
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-2 mt-2">
                                <Badge variant={announcement.is_active ? "default" : "secondary"}>
                                  {announcement.is_active ? "Ativo" : "Inativo"}
                                </Badge>
                                {announcement.scheduled_at && !announcement.is_active && (
                                  <Badge variant="outline" className="border-accent text-accent">
                                    <Clock className="h-3 w-3 mr-1" />
                                    {new Date(announcement.scheduled_at).toLocaleString('pt-BR', {
                                      day: '2-digit',
                                      month: '2-digit',
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })}
                                  </Badge>
                                )}
                                <span className="text-xs text-muted-foreground">
                                  {new Date(announcement.created_at).toLocaleDateString('pt-BR')}
                                </span>
                              </div>
                            </div>
                            <div className="flex flex-col gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => toggleAnnouncementActive(announcement.id, announcement.is_active)}
                              >
                                {announcement.is_active ? "Desativar" : "Ativar"}
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => deleteAnnouncement(announcement.id)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        );

      case "marketplace-products":
        return (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold">Produtos do Marketplace</h2>
              <Button onClick={() => { setEditingProduct(null); setShowProductModal(true); }} className="bg-accent hover:bg-accent/90">
                <Package className="h-4 w-4 mr-2" />
                Novo Produto
              </Button>
            </div>
            
            {marketplaceProducts.length === 0 ? (
              <Card className="border-border">
                <CardContent className="p-8 text-center">
                  <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Nenhum produto cadastrado ainda</p>
                  <Button onClick={() => { setEditingProduct(null); setShowProductModal(true); }} className="mt-4">
                    Cadastrar primeiro produto
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {marketplaceProducts.map((product) => (
                  <Card key={product.id} className="border-accent/30 overflow-hidden">
                    <div className="w-full h-40 bg-secondary overflow-hidden">
                      {product.image_url ? (
                        <img 
                          src={getAdminProductImage(product.image_url)} 
                          alt={product.name} 
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="h-12 w-12 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-bold">{product.name}</h3>
                        {product.is_sold_out && (
                          <Badge variant="destructive">Esgotado</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{product.description}</p>
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-lg font-bold text-green-500">R$ {product.price.toFixed(2)}</p>
                          <p className="text-xs text-muted-foreground">Estoque: {product.stock}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => { setEditingProduct(product); setShowProductModal(true); }}
                          >
                            Editar
                          </Button>
                          <Button 
                            size="sm" 
                            variant="destructive"
                            onClick={() => deleteMarketplaceProduct(product.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        );

      case "marketplace-sales":
        const updateOrderStatus = async (orderId: string, newStatus: string, previousStatus: string) => {
          try {
            // Se mudando para cancelado, precisamos reembolsar o usuário
            if (newStatus === 'cancelado' && previousStatus !== 'cancelado') {
              // Buscar dados do pedido
              const { data: orderData, error: orderError } = await supabase
                .from("marketplace_orders")
                .select("user_id, total_price")
                .eq("id", orderId)
                .single();

              if (orderError) throw orderError;

              // Atualizar saldo do usuário
              const { data: walletData } = await supabase
                .from("sms_user_wallets")
                .select("balance")
                .eq("user_id", orderData.user_id)
                .single();

              const currentBalance = walletData?.balance || 0;
              const newBalance = currentBalance + orderData.total_price;

              await supabase
                .from("sms_user_wallets")
                .upsert({ 
                  user_id: orderData.user_id, 
                  balance: newBalance,
                  updated_at: new Date().toISOString()
                });

              // Registrar transação de reembolso
              await supabase
                .from("sms_transactions")
                .insert({
                  user_id: orderData.user_id,
                  type: 'refund',
                  amount: orderData.total_price,
                  description: `Reembolso - Pedido de ativo cancelado`,
                  status: 'completed'
                });
            }

            const { error } = await supabase
              .from("marketplace_orders")
              .update({ status: newStatus })
              .eq("id", orderId);

            if (error) throw error;
            toast.success(newStatus === 'cancelado' ? "Pedido cancelado e saldo reembolsado!" : "Status atualizado!");
            loadMarketplaceData();
          } catch (err) {
            console.error("Error updating order status:", err);
            toast.error("Erro ao atualizar status");
          }
        };

        return (
          <Card className="border-2 border-accent">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingBag className="h-5 w-5 text-accent" />
                Vendas de Ativos
              </CardTitle>
              <CardDescription>
                Todas as vendas de ativos para anúncios
              </CardDescription>
            </CardHeader>
            <CardContent>
              {marketplaceOrders.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Nenhuma venda ainda</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produto</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>WhatsApp</TableHead>
                        <TableHead>Qtd</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Alterar Status</TableHead>
                        <TableHead>Data</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {marketplaceOrders.map((order) => (
                        <TableRow key={order.id}>
                          <TableCell className="font-medium">{order.product_name}</TableCell>
                          <TableCell>{order.customer_name || '-'}</TableCell>
                          <TableCell>
                            {order.customer_whatsapp ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-auto py-1 px-2"
                                onClick={() => {
                                  navigator.clipboard.writeText(order.customer_whatsapp!);
                                  toast.success("WhatsApp copiado!");
                                }}
                              >
                                <Copy className="h-3 w-3 mr-1" />
                                {order.customer_whatsapp}
                              </Button>
                            ) : '-'}
                          </TableCell>
                          <TableCell>{order.quantity}</TableCell>
                          <TableCell className="text-green-500 font-bold">R$ {order.total_price.toFixed(2)}</TableCell>
                          <TableCell>
                            <Badge 
                              variant="secondary"
                              className={
                                order.status === 'entregue' || order.status === 'completed' 
                                  ? 'bg-green-500/20 text-green-500' 
                                  : order.status === 'cancelado'
                                  ? 'bg-red-500/20 text-red-500'
                                  : 'bg-yellow-500/20 text-yellow-500'
                              }
                            >
                              {order.status === 'pending' || order.status === 'confirmed' || order.status === 'em_andamento' 
                                ? 'Em andamento' 
                                : order.status === 'entregue' || order.status === 'completed'
                                ? 'Entregue'
                                : order.status === 'cancelado'
                                ? 'Cancelado'
                                : order.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={order.status}
                              onValueChange={(value) => updateOrderStatus(order.id, value, order.status)}
                            >
                              <SelectTrigger className="w-36">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="em_andamento">Em andamento</SelectItem>
                                <SelectItem value="entregue">Entregue</SelectItem>
                                <SelectItem value="cancelado">Cancelado</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>{new Date(order.created_at).toLocaleString('pt-BR')}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        );

      default:
        return null;
    }
  };

  return (
    <>
      <Header />
      <div className="h-14 md:h-16" />
      <div className="min-h-screen bg-background flex">
        {/* Sidebar */}
        <aside className={`${sidebarOpen ? 'w-64' : 'w-0 md:w-16'} transition-all duration-300 bg-card border-r border-border overflow-hidden`}>
          <div className="p-4">
            <div className="flex items-center justify-between mb-6">
              {sidebarOpen && (
                <h2 className="text-lg font-bold bg-gradient-to-r from-accent to-orange-400 bg-clip-text text-transparent">
                  Admin
                </h2>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="ml-auto"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </div>

            <nav className="space-y-6">
              {SIDEBAR_MENU.map((category) => (
                <div key={category.category}>
                  {sidebarOpen && (
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
                      <category.icon className="h-4 w-4" />
                      {category.category}
                    </h3>
                  )}
                  <div className="space-y-1">
                    {category.items.map((item) => (
                      <Button
                        key={item.id}
                        variant={activeSection === item.id ? "secondary" : "ghost"}
                        className={`w-full ${sidebarOpen ? 'justify-start' : 'justify-center'} ${
                          activeSection === item.id ? 'bg-accent/20 text-accent' : ''
                        }`}
                        onClick={() => setActiveSection(item.id)}
                      >
                        <item.icon className={`h-4 w-4 ${sidebarOpen ? 'mr-2' : ''}`} />
                        {sidebarOpen && <span>{item.label}</span>}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </nav>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-4 md:p-8 overflow-auto">
          <header className="mb-8">
            <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-accent to-orange-400 bg-clip-text text-transparent">
              Painel Administrativo
            </h1>
            <p className="text-muted-foreground mt-2">
              {SIDEBAR_MENU.flatMap(c => c.items).find(i => i.id === activeSection)?.label || 'Dashboard'}
            </p>
          </header>

          {renderContent()}
        </main>
      </div>

      {/* Product Metrics Modal */}
      <Dialog open={!!selectedProductForMetrics} onOpenChange={() => setSelectedProductForMetrics(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Métricas: {selectedProductForMetrics?.name}</DialogTitle>
          </DialogHeader>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Investido</TableHead>
                  <TableHead>Leads</TableHead>
                  <TableHead>PIX</TableHead>
                  <TableHead>Total PIX</TableHead>
                  <TableHead>CPL</TableHead>
                  <TableHead>Conv.</TableHead>
                  <TableHead>ROAS</TableHead>
                  <TableHead>Resultado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedProductForMetrics && getProductMetrics(selectedProductForMetrics.id).map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>{m.date}</TableCell>
                    <TableCell>R$ {m.invested.toFixed(2)}</TableCell>
                    <TableCell>{m.leads}</TableCell>
                    <TableCell>{m.pix_count}</TableCell>
                    <TableCell>R$ {m.pix_total.toFixed(2)}</TableCell>
                    <TableCell>R$ {m.cpl.toFixed(2)}</TableCell>
                    <TableCell>{m.conversion.toFixed(1)}%</TableCell>
                    <TableCell>{m.roas.toFixed(2)}x</TableCell>
                    <TableCell className={m.result >= 0 ? 'text-green-500' : 'text-red-500'}>
                      R$ {m.result.toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      {/* Wallet Management Modal */}
      <Dialog open={!!selectedWalletUser} onOpenChange={() => setSelectedWalletUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gerenciar Carteira</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">Usuário</p>
              <p className="font-semibold">{selectedWalletUser?.username || selectedWalletUser?.user_email}</p>
              <p className="text-sm text-muted-foreground mt-2">Saldo atual</p>
              <p className="text-2xl font-bold text-accent">R$ {selectedWalletUser?.balance.toFixed(2)}</p>
            </div>

            <div className="space-y-2">
              <Label>Valor</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={walletAmount}
                onChange={(e) => setWalletAmount(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Descrição (opcional)</Label>
              <Input
                placeholder="Motivo da alteração"
                value={walletDescription}
                onChange={(e) => setWalletDescription(e.target.value)}
              />
            </div>

            <div className="flex gap-2">
              <Button
                onClick={() => updateUserWallet(true)}
                disabled={updatingWallet || !walletAmount}
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                {updatingWallet ? <Loader2 className="h-4 w-4 animate-spin" /> : "Adicionar Saldo"}
              </Button>
              <Button
                onClick={() => updateUserWallet(false)}
                disabled={updatingWallet || !walletAmount}
                variant="destructive"
                className="flex-1"
              >
                {updatingWallet ? <Loader2 className="h-4 w-4 animate-spin" /> : "Remover Saldo"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Announcement Preview Modal */}
      <Dialog open={showAnnouncementPreview} onOpenChange={setShowAnnouncementPreview}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Prévia do Aviso</DialogTitle>
          </DialogHeader>
          <Card className="border-accent">
            <CardContent className="p-4 space-y-3">
              {newAnnouncementTitle && (
                <h3 className="font-semibold text-lg">{newAnnouncementTitle}</h3>
              )}
              {newAnnouncementImage && (
                <img src={newAnnouncementImage} alt="Preview" className="w-full rounded-lg" />
              )}
              <p className="whitespace-pre-wrap">{newAnnouncementContent}</p>
              {newAnnouncementRedirectType === 'custom_link' && newAnnouncementRedirectUrl && (
                <Button className="w-full">
                  {newAnnouncementButtonText || "Acessar"}
                </Button>
              )}
              {newAnnouncementRedirectType === 'system' && newAnnouncementSystems.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {newAnnouncementSystems.map(sysId => {
                    const sys = SYSTEMS.find(s => s.id === sysId);
                    return sys ? (
                      <Badge key={sysId} variant="outline">
                        {sys.emoji} {sys.name}
                      </Badge>
                    ) : null;
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </DialogContent>
      </Dialog>

      {/* Marketplace Product Modal */}
      <MarketplaceProductModal
        open={showProductModal}
        onOpenChange={setShowProductModal}
        onSuccess={loadMarketplaceData}
        editProduct={editingProduct as any}
      />
    </>
  );
};

export default AdminPanelNew;
