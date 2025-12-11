import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Header } from "@/components/Header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Copy, Star, ExternalLink, ChevronDown, ChevronRight, ArrowUpDown, Filter, Search, X, Key, Loader2, UserPlus, Activity, Megaphone, Eye, MousePointer, Trash2, Image } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

type AdminOfferStatus = 'minerada' | 'ruim' | 'boa' | null;
type AnnouncementRedirectType = 'none' | 'custom_link' | 'system';

// Sistemas disponíveis para redirecionamento
const SYSTEMS = [
  { id: "metricas", name: "Sistema de Métricas", emoji: "📊" },
  { id: "organizador-numeros", name: "Organizador de Números", emoji: "📱" },
  { id: "track-ofertas", name: "Track Ofertas", emoji: "🎯" },
  { id: "criador-funil", name: "Criador de Funil", emoji: "💬" },
  { id: "gerador-criativos", name: "Gerador de Criativos", emoji: "🎨" },
  { id: "gerador-audio", name: "Gerador de Áudio", emoji: "🎙️" },
  { id: "transcricao-audio", name: "Transcrição de Áudio", emoji: "📝" },
  { id: "zap-spy", name: "Zap Spy", emoji: "🔍" },
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

  // UI State for hierarchical navigation
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [expandedUserNumbers, setExpandedUserNumbers] = useState<string | null>(null);
  
  // Modal state for product metrics
  const [selectedProductForMetrics, setSelectedProductForMetrics] = useState<{id: string; name: string} | null>(null);

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

  useEffect(() => {
    loadAllData();
    loadAnnouncements();
  }, [user]);

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
      };

      const { error } = await supabase
        .from("admin_announcements")
        .insert(announcementData);

      if (error) throw error;

      toast.success("Aviso criado com sucesso!");
      
      // Reset form
      setNewAnnouncementTitle("");
      setNewAnnouncementContent("");
      setNewAnnouncementImage(null);
      setNewAnnouncementRedirectType("none");
      setNewAnnouncementRedirectUrl("");
      setNewAnnouncementButtonText("");
      setNewAnnouncementSystems([]);
      
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
        // Try to parse error message from response
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

    // Basic email validation
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

      // Check the results
      const results = data?.results || [];
      const created = results.filter((r: any) => r.status === 'created');
      const existing = results.filter((r: any) => r.status === 'exists');

      if (created.length > 0) {
        toast.success(`Usuário criado com sucesso! Senha: ${newUserPassword}`);
        setNewUserEmail("");
        loadAllData(); // Reload to show new user
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
    // Get products from the products data, not from metrics
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
    
    // Filter by search
    if (userSearch.trim()) {
      const search = userSearch.toLowerCase();
      result = result.filter(u => 
        u.username?.toLowerCase().includes(search) || 
        u.email?.toLowerCase().includes(search)
      );
    }
    
    // Sort
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

  // Get sorted and filtered offers
  const getSortedFilteredOffers = () => {
    let filtered = [...offers];
    
    // Filter by link search
    if (offerLinkSearch.trim()) {
      const search = offerLinkSearch.toLowerCase();
      filtered = filtered.filter(o => 
        o.ad_library_link.toLowerCase().includes(search) ||
        o.name.toLowerCase().includes(search)
      );
    }
    
    // Filter by status
    if (offerStatusFilter !== 'all') {
      if (offerStatusFilter === 'none') {
        filtered = filtered.filter(o => !o.admin_status);
      } else {
        filtered = filtered.filter(o => o.admin_status === offerStatusFilter);
      }
    }

    // Sort
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

  return (
    <>
      <Header />
      <div className="h-14 md:h-16" />
      <div className="min-h-screen bg-background p-4 md:p-8">
        <div className="container mx-auto">
          <header className="text-center mb-8">
            <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-accent to-orange-400 bg-clip-text text-transparent">
              Painel Administrativo
            </h1>
            <p className="text-muted-foreground mt-2">
              Gerencie usuários, métricas, números e ofertas
            </p>
          </header>

          <Tabs defaultValue="metrics" className="w-full">
            <TabsList className="grid w-full grid-cols-7 mb-6">
              <TabsTrigger value="metrics">Métricas</TabsTrigger>
              <TabsTrigger value="numbers">Números</TabsTrigger>
              <TabsTrigger value="offers">Ofertas</TabsTrigger>
              <TabsTrigger value="activities">Atividades</TabsTrigger>
              <TabsTrigger value="announcements">Avisos</TabsTrigger>
              <TabsTrigger value="passwords">Senhas</TabsTrigger>
              <TabsTrigger value="create-user">Criar</TabsTrigger>
            </TabsList>

            {/* MÉTRICAS USUÁRIOS */}
            <TabsContent value="metrics">
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
            </TabsContent>

            {/* NÚMEROS USUÁRIOS */}
            <TabsContent value="numbers">
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
            </TabsContent>

            {/* OFERTAS USUÁRIOS */}
            <TabsContent value="offers">
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
                                  <SelectValue>
                                    {getStatusBadge(o.admin_status)}
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">Sem status</SelectItem>
                                  <SelectItem value="minerada">Minerada</SelectItem>
                                  <SelectItem value="ruim">Ruim</SelectItem>
                                  <SelectItem value="boa">Boa</SelectItem>
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
            </TabsContent>

            {/* ATIVIDADES */}
            <TabsContent value="activities">
              <Card className="border-2 border-accent">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-accent" />
                    Histórico de Atividades
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Usuário</TableHead>
                          <TableHead>Sistema</TableHead>
                          <TableHead>Data/Hora</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {activities.map((activity) => (
                          <TableRow key={activity.id}>
                            <TableCell className="font-medium">
                              {activity.username !== 'N/A' ? activity.username : activity.user_email}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="border-accent/50">
                                {activity.activity_name}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {new Date(activity.created_at).toLocaleString('pt-BR', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </TableCell>
                          </TableRow>
                        ))}
                        {activities.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center text-muted-foreground">
                              Nenhuma atividade registrada
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* RESETAR SENHAS */}
            <TabsContent value="passwords">
              <Card className="border-2 border-accent">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Key className="h-5 w-5 text-accent" />
                    Redefinir Senha de Usuário
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="max-w-md space-y-4">
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
                  </div>
                  <p className="text-sm text-muted-foreground mt-4">
                    A nova senha será aplicada imediatamente. O usuário poderá fazer login com a nova senha.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>

            {/* CRIAR USUÁRIO */}
            <TabsContent value="create-user">
              <Card className="border-2 border-accent">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <UserPlus className="h-5 w-5 text-accent" />
                    Criar Novo Usuário
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="max-w-md space-y-4">
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
                  </div>
                  <p className="text-sm text-muted-foreground mt-4">
                    O usuário poderá fazer login imediatamente com o email e senha informados.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>

            {/* AVISOS */}
            <TabsContent value="announcements">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Criar Novo Aviso */}
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
                            Criando...
                          </>
                        ) : (
                          <>
                            <Megaphone className="mr-2 h-4 w-4" />
                            Publicar
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Histórico de Avisos */}
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
                    <div className="space-y-3 max-h-[500px] overflow-y-auto">
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
                                <div className="flex items-center gap-2 mt-2">
                                  <Badge variant={announcement.is_active ? "default" : "secondary"}>
                                    {announcement.is_active ? "Ativo" : "Inativo"}
                                  </Badge>
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
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => deleteAnnouncement(announcement.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                      {announcements.length === 0 && (
                        <p className="text-center text-muted-foreground py-8">
                          Nenhum aviso criado ainda
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Modal de Métricas do Produto */}
      <Dialog 
        open={!!selectedProductForMetrics} 
        onOpenChange={(open) => !open && setSelectedProductForMetrics(null)}
      >
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto border-accent">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Métricas: {selectedProductForMetrics?.name}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Estrutura</TableHead>
                  <TableHead>Investido</TableHead>
                  <TableHead>Leads</TableHead>
                  <TableHead>CPL</TableHead>
                  <TableHead>Vendas</TableHead>
                  <TableHead>Faturamento</TableHead>
                  <TableHead>Resultado</TableHead>
                  <TableHead>ROAS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedProductForMetrics && getProductMetrics(selectedProductForMetrics.id).map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>{m.date}</TableCell>
                    <TableCell className="max-w-[150px] truncate">{m.structure}</TableCell>
                    <TableCell>R$ {m.invested.toFixed(2)}</TableCell>
                    <TableCell>{m.leads}</TableCell>
                    <TableCell>R$ {m.cpl.toFixed(2)}</TableCell>
                    <TableCell>{m.pix_count}</TableCell>
                    <TableCell>R$ {m.pix_total.toFixed(2)}</TableCell>
                    <TableCell className={m.result >= 0 ? 'text-green-500' : 'text-red-500'}>
                      R$ {m.result.toFixed(2)}
                    </TableCell>
                    <TableCell>{m.roas.toFixed(2)}x</TableCell>
                  </TableRow>
                ))}
                {selectedProductForMetrics && getProductMetrics(selectedProductForMetrics.id).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground">
                      Nenhuma métrica cadastrada para este produto
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Preview do Aviso */}
      <Dialog open={showAnnouncementPreview} onOpenChange={setShowAnnouncementPreview}>
        <DialogContent className="max-w-lg border-accent">
          <DialogHeader>
            {newAnnouncementTitle && (
              <DialogTitle className="text-xl text-center">
                {newAnnouncementTitle}
              </DialogTitle>
            )}
          </DialogHeader>

          <div className="space-y-4">
            {/* Imagem */}
            {newAnnouncementImage && (
              <div className="w-full rounded-lg overflow-hidden">
                <img 
                  src={newAnnouncementImage} 
                  alt="Preview" 
                  className="w-full h-auto object-contain max-h-64"
                />
              </div>
            )}

            {/* Conteúdo */}
            <p className="text-center text-muted-foreground whitespace-pre-wrap">
              {newAnnouncementContent || "Conteúdo do aviso..."}
            </p>

            {/* Sistemas */}
            {newAnnouncementRedirectType === 'system' && newAnnouncementSystems.length > 0 && (
              <div className="flex flex-wrap justify-center gap-3 pt-2">
                {newAnnouncementSystems.map(systemId => {
                  const system = SYSTEMS.find(s => s.id === systemId);
                  if (!system) return null;
                  return (
                    <Button
                      key={systemId}
                      variant="outline"
                      className="flex flex-col items-center gap-1 h-auto py-3 px-4 border-accent hover:bg-accent/10"
                      onClick={() => {}}
                    >
                      <span className="text-2xl">{system.emoji}</span>
                      <span className="text-xs">{system.name}</span>
                    </Button>
                  );
                })}
              </div>
            )}

            {/* Botão de redirecionamento */}
            {newAnnouncementRedirectType === 'custom_link' && newAnnouncementRedirectUrl && (
              <div className="flex justify-center pt-2">
                <Button className="bg-accent hover:bg-accent/90 text-accent-foreground">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  {newAnnouncementButtonText || "Acessar"}
                </Button>
              </div>
            )}

            {/* Botão Fechar */}
            <div className="flex justify-center pt-2">
              <Button
                variant="ghost"
                onClick={() => setShowAnnouncementPreview(false)}
                className="text-muted-foreground"
              >
                <X className="mr-2 h-4 w-4" />
                Fechar
              </Button>
            </div>
          </div>

          <div className="text-center text-xs text-muted-foreground border-t pt-3 mt-3">
            Este é um preview. O aviso ainda não foi publicado.
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AdminPanelNew;