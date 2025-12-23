import { useState, useEffect, useMemo } from "react";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { NeonButton } from "@/components/ui/neon-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ExternalLink, Plus, Pencil, Trash2, EyeOff, Eye, Search, Flame, Calendar, X, Star, Bookmark, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminStatus } from "@/hooks/useAdminStatus";
import { splashedToast, splashedToast as toast } from "@/hooks/useSplashedToast";
import { useActivityTracker } from "@/hooks/useActivityTracker";
import { AnimatedSearchBar } from "@/components/ui/animated-search-bar";

interface ZapSpyOffer {
  id: string;
  name: string;
  ad_library_link: string;
  niche: string;
  is_hidden: boolean;
  created_at: string;
  active_ads_count: number;
  start_date: string | null;
  image_url: string | null;
  is_featured: boolean;
}

const ZapSpy = () => {
  useActivityTracker("page_visit", "Zap Spy");
  const { user } = useAuth();
  const { isAdmin } = useAdminStatus();
  const [offers, setOffers] = useState<ZapSpyOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNiche, setSelectedNiche] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<'none' | 'most_scaled' | 'oldest'>('most_scaled');
  const [savedOfferLinks, setSavedOfferLinks] = useState<Set<string>>(new Set());
  
  // Admin form state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState<ZapSpyOffer | null>(null);
  const [formName, setFormName] = useState("");
  const [formLink, setFormLink] = useState("");
  const [formNiche, setFormNiche] = useState("");
  const [formActiveAds, setFormActiveAds] = useState<number>(0);
  const [formStartDate, setFormStartDate] = useState("");
  const [formImagePreview, setFormImagePreview] = useState<string | null>(null);
  const [formImageFile, setFormImageFile] = useState<File | null>(null);
  const [formIsFeatured, setFormIsFeatured] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [nicheSuggestions, setNicheSuggestions] = useState<string[]>([]);
  const [showNicheSuggestions, setShowNicheSuggestions] = useState(false);
  const [savingOfferId, setSavingOfferId] = useState<string | null>(null);

  // Helper function to get ad count color
  const getAdCountColor = (count: number) => {
    if (count >= 100) return 'text-red-500';
    if (count >= 50) return 'text-green-500';
    return 'text-orange-400';
  };

  // Save offer to Track Ofertas
  const handleSaveOfferToTrack = async (offer: ZapSpyOffer) => {
    if (!user) {
      splashedToast.error("Erro", "Você precisa estar logado para salvar ofertas");
      return;
    }
    
    // Check if already saved
    if (savedOfferLinks.has(offer.ad_library_link)) {
      splashedToast.info("Info", "Você já salvou esta oferta");
      return;
    }
    
    setSavingOfferId(offer.id);
    try {
      const { error } = await supabase
        .from("tracked_offers")
        .insert({
          user_id: user.id,
          name: offer.name,
          ad_library_link: offer.ad_library_link
        });

      if (error) {
        if (error.code === '23505') {
          splashedToast.info("Info", "Você já salvou esta oferta");
          setSavedOfferLinks(prev => new Set(prev).add(offer.ad_library_link));
        } else {
          throw error;
        }
      } else {
        splashedToast.success("Sucesso", "Oferta salva no Track Ofertas!");
        setSavedOfferLinks(prev => new Set(prev).add(offer.ad_library_link));
      }
    } catch (err) {
      console.error("Error saving offer:", err);
      splashedToast.error("Erro", "Erro ao salvar oferta");
    } finally {
      setSavingOfferId(null);
    }
  };

  // Load user's saved offers to check which are already saved
  const loadSavedOffers = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from("tracked_offers")
        .select("ad_library_link")
        .eq("user_id", user.id);

      if (error) throw error;
      
      const links = new Set((data || []).map(o => o.ad_library_link));
      setSavedOfferLinks(links);
    } catch (err) {
      console.error("Error loading saved offers:", err);
    }
  };

  // Get unique niches from offers
  const availableNiches = useMemo(() => {
    const niches = [...new Set(offers.map(o => o.niche))].filter(Boolean);
    return niches.sort();
  }, [offers]);

  useEffect(() => {
    loadOffers();
    loadSavedOffers();
  }, [user]);

  const loadOffers = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("zap_spy_offers")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setOffers((data || []) as ZapSpyOffer[]);
      
      // Set niche suggestions from existing offers
      const niches = [...new Set((data || []).map((o: any) => o.niche))].filter(Boolean) as string[];
      setNicheSuggestions(niches);
    } catch (err) {
      console.error("Error loading offers:", err);
      splashedToast.error("Erro", "Erro ao carregar ofertas");
    } finally {
      setLoading(false);
    }
  };

  const handleAddOffer = async () => {
    if (!formName.trim() || !formLink.trim() || !formNiche.trim()) {
      splashedToast.error("Erro", "Preencha todos os campos obrigatórios");
      return;
    }

    setSubmitting(true);
    try {
      let imageUrl: string | null = null;
      
      // Upload image if exists
      if (formImageFile) {
        const fileExt = formImageFile.name.split('.').pop() || 'png';
        const fileName = `${crypto.randomUUID()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('offer-images')
          .upload(fileName, formImageFile);
          
        if (uploadError) throw uploadError;
        
        const { data: { publicUrl } } = supabase.storage
          .from('offer-images')
          .getPublicUrl(fileName);
          
        imageUrl = publicUrl;
      }
      
      const { error } = await supabase
        .from("zap_spy_offers")
        .insert({
          name: formName.trim(),
          ad_library_link: formLink.trim(),
          niche: formNiche.trim(),
          active_ads_count: formActiveAds || 0,
          start_date: formStartDate || null,
          image_url: imageUrl,
          is_featured: formIsFeatured,
          created_by: user?.id
        });

      if (error) throw error;

      splashedToast.success("Sucesso", "Oferta cadastrada com sucesso!");
      setAddDialogOpen(false);
      resetForm();
      loadOffers();
    } catch (err) {
      console.error("Error adding offer:", err);
      splashedToast.error("Erro", "Erro ao cadastrar oferta");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditOffer = async () => {
    if (!selectedOffer || !formName.trim() || !formLink.trim() || !formNiche.trim()) {
      splashedToast.error("Erro", "Preencha todos os campos obrigatórios");
      return;
    }

    setSubmitting(true);
    try {
      let imageUrl = selectedOffer.image_url;
      
      // Upload new image if exists
      if (formImageFile) {
        const fileExt = formImageFile.name.split('.').pop() || 'png';
        const fileName = `${crypto.randomUUID()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('offer-images')
          .upload(fileName, formImageFile);
          
        if (uploadError) throw uploadError;
        
        const { data: { publicUrl } } = supabase.storage
          .from('offer-images')
          .getPublicUrl(fileName);
          
        imageUrl = publicUrl;
      }
      
      const { error } = await supabase
        .from("zap_spy_offers")
        .update({
          name: formName.trim(),
          ad_library_link: formLink.trim(),
          niche: formNiche.trim(),
          active_ads_count: formActiveAds || 0,
          start_date: formStartDate || null,
          image_url: imageUrl,
          is_featured: formIsFeatured
        })
        .eq("id", selectedOffer.id);

      if (error) throw error;

      splashedToast.success("Sucesso", "Oferta atualizada com sucesso!");
      setEditDialogOpen(false);
      setSelectedOffer(null);
      loadOffers();
    } catch (err) {
      console.error("Error updating offer:", err);
      splashedToast.error("Erro", "Erro ao atualizar oferta");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteOffer = async () => {
    if (!selectedOffer) return;

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("zap_spy_offers")
        .delete()
        .eq("id", selectedOffer.id);

      if (error) throw error;

      splashedToast.success("Sucesso", "Oferta removida com sucesso!");
      setDeleteDialogOpen(false);
      setSelectedOffer(null);
      loadOffers();
    } catch (err) {
      console.error("Error deleting offer:", err);
      splashedToast.error("Erro", "Erro ao remover oferta");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleVisibility = async (offer: ZapSpyOffer) => {
    try {
      const { error } = await supabase
        .from("zap_spy_offers")
        .update({ is_hidden: !offer.is_hidden })
        .eq("id", offer.id);

      if (error) throw error;

      splashedToast.success("Sucesso", offer.is_hidden ? "Oferta visível" : "Oferta oculta");
      loadOffers();
    } catch (err) {
      console.error("Error toggling visibility:", err);
      splashedToast.error("Erro", "Erro ao alterar visibilidade");
    }
  };

  const resetForm = () => {
    setFormName("");
    setFormLink("");
    setFormNiche("");
    setFormActiveAds(0);
    setFormStartDate("");
    setFormImagePreview(null);
    setFormImageFile(null);
    setFormIsFeatured(false);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          setFormImageFile(file);
          const reader = new FileReader();
          reader.onload = (event) => {
            setFormImagePreview(event.target?.result as string);
          };
          reader.readAsDataURL(file);
          toast.success("Imagem colada!");
        }
        break;
      }
    }
  };

  const removeImage = () => {
    setFormImagePreview(null);
    setFormImageFile(null);
  };

  const openEditDialog = (offer: ZapSpyOffer) => {
    setSelectedOffer(offer);
    setFormName(offer.name);
    setFormLink(offer.ad_library_link);
    setFormNiche(offer.niche);
    setFormActiveAds(offer.active_ads_count || 0);
    setFormStartDate(offer.start_date || "");
    setFormImagePreview(offer.image_url);
    setFormImageFile(null);
    setFormIsFeatured(offer.is_featured || false);
    setEditDialogOpen(true);
  };

  const openDeleteDialog = (offer: ZapSpyOffer) => {
    setSelectedOffer(offer);
    setDeleteDialogOpen(true);
  };

  const filteredNicheSuggestions = formNiche
    ? nicheSuggestions.filter(n => n.toLowerCase().includes(formNiche.toLowerCase()) && n !== formNiche)
    : nicheSuggestions;

  const filteredOffers = useMemo(() => {
    let result = offers.filter(offer => {
      const matchesNiche = selectedNiche === "all" || offer.niche === selectedNiche;
      const matchesSearch = offer.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesNiche && matchesSearch;
    });

    // Apply sorting
    if (sortBy === 'most_scaled') {
      result = [...result].sort((a, b) => (b.active_ads_count || 0) - (a.active_ads_count || 0));
    } else if (sortBy === 'oldest') {
      result = [...result].sort((a, b) => {
        if (!a.start_date) return 1;
        if (!b.start_date) return -1;
        return new Date(a.start_date).getTime() - new Date(b.start_date).getTime();
      });
    }

    return result;
  }, [offers, selectedNiche, searchQuery, sortBy]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  return (
    <>
      <Header />
      <div className="h-14 md:h-16" />
      <div className="min-h-screen bg-background p-4 md:p-8">
        <div className="container mx-auto max-w-6xl">
          <header className="text-center mb-8">
            <div className="flex items-center justify-center gap-3 mb-4">
              <Search className="h-10 w-10 text-accent" />
              <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-accent to-orange-400 bg-clip-text text-transparent">
                Zap Spy
              </h1>
            </div>
            <p className="text-muted-foreground">
              Acesse as ofertas mais escaladas de X1
            </p>
          </header>

          {/* Filters */}
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="flex-1">
              <AnimatedSearchBar
                placeholder="Buscar oferta..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full"
              />
            </div>
            <Select value={selectedNiche} onValueChange={setSelectedNiche}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Filtrar por nicho" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os nichos</SelectItem>
                {availableNiches.map((niche) => (
                  <SelectItem key={niche} value={niche}>{niche}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Ordenar por" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem ordenação</SelectItem>
                <SelectItem value="most_scaled">Mais escaladas</SelectItem>
                <SelectItem value="oldest">Mais antigas</SelectItem>
              </SelectContent>
            </Select>

            {sortBy !== 'none' && (
              <Button variant="ghost" size="icon" onClick={() => setSortBy('none')}>
                <X className="h-4 w-4" />
              </Button>
            )}

            {isAdmin && (
              <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-accent hover:bg-accent/90">
                    <Plus className="h-4 w-4 mr-2" />
                    Cadastrar Oferta
                  </Button>
                </DialogTrigger>
                <DialogContent className="border-accent" onPaste={handlePaste}>
                  <DialogHeader>
                    <DialogTitle>Cadastrar Nova Oferta</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>Imagem de Prévia (Cole com Ctrl+V)</Label>
                      <div 
                        className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:border-accent transition-colors"
                        onClick={() => {}}
                      >
                        {formImagePreview ? (
                          <div className="relative">
                            <img 
                              src={formImagePreview} 
                              alt="Preview" 
                              className="max-h-32 mx-auto rounded-lg object-cover"
                            />
                            <Button
                              variant="destructive"
                              size="icon"
                              className="absolute top-0 right-0 h-6 w-6"
                              onClick={(e) => { e.stopPropagation(); removeImage(); }}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <p className="text-muted-foreground text-sm">
                            Cole uma imagem aqui (Ctrl+V)
                          </p>
                        )}
                      </div>
                    </div>
                    <div>
                      <Label>Nome da Oferta *</Label>
                      <Input
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                        placeholder="Ex: Curso de Emagrecimento"
                      />
                    </div>
                    <div>
                      <Label>Link da Biblioteca de Anúncios *</Label>
                      <Input
                        value={formLink}
                        onChange={(e) => setFormLink(e.target.value)}
                        placeholder="https://www.facebook.com/ads/library/..."
                      />
                    </div>
                    <div className="relative">
                      <Label>Nicho *</Label>
                      <Input
                        value={formNiche}
                        onChange={(e) => {
                          setFormNiche(e.target.value);
                          setShowNicheSuggestions(true);
                        }}
                        onFocus={() => setShowNicheSuggestions(true)}
                        onBlur={() => setTimeout(() => setShowNicheSuggestions(false), 200)}
                        placeholder="Digite o nicho..."
                      />
                      {showNicheSuggestions && filteredNicheSuggestions.length > 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-background border border-border rounded-md shadow-lg max-h-40 overflow-auto">
                          {filteredNicheSuggestions.map((niche) => (
                            <button
                              key={niche}
                              type="button"
                              className="w-full px-3 py-2 text-left hover:bg-accent/10 transition-colors"
                              onClick={() => {
                                setFormNiche(niche);
                                setShowNicheSuggestions(false);
                              }}
                            >
                              {niche}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <Label>Total de Anúncios Ativos</Label>
                      <Input
                        type="number"
                        value={formActiveAds}
                        onChange={(e) => setFormActiveAds(parseInt(e.target.value) || 0)}
                        placeholder="0"
                        min={0}
                      />
                    </div>
                    <div>
                      <Label>Data de Início</Label>
                      <Input
                        type="date"
                        value={formStartDate}
                        onChange={(e) => setFormStartDate(e.target.value)}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="featured-toggle" className="flex items-center gap-2">
                        <Star className="h-4 w-4 text-yellow-500" />
                        OFERTA FODA
                      </Label>
                      <Switch
                        id="featured-toggle"
                        checked={formIsFeatured}
                        onCheckedChange={setFormIsFeatured}
                        className="data-[state=checked]:bg-green-500"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => { setAddDialogOpen(false); resetForm(); }}>Cancelar</Button>
                    <Button onClick={handleAddOffer} disabled={submitting} className="bg-accent hover:bg-accent/90">
                      {submitting ? "Salvando..." : "Salvar"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>

          {/* Offers Grid */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
            </div>
          ) : filteredOffers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Nenhuma oferta encontrada
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredOffers.map((offer) => (
                <Card key={offer.id} className={`border-2 border-accent ${offer.is_hidden ? 'opacity-50' : ''} relative overflow-hidden`}>
                  {offer.is_featured && (
                    <div className="bg-gradient-to-r from-yellow-500 to-orange-500 text-black text-center py-1 px-2 text-xs font-bold flex items-center justify-center gap-1">
                      <Star className="h-3 w-3 fill-current" />
                      OFERTA FODA
                      <Star className="h-3 w-3 fill-current" />
                    </div>
                  )}
                  {offer.image_url && (
                    <div className="w-full h-40 overflow-hidden">
                      <img 
                        src={offer.image_url} 
                        alt={offer.name} 
                        className="w-full h-full object-cover object-top"
                      />
                    </div>
                  )}
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-lg line-clamp-2">{offer.name}</CardTitle>
                      {isAdmin && (
                        <div className="flex gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleToggleVisibility(offer)}
                          >
                            {offer.is_hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEditDialog(offer)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => openDeleteDialog(offer)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className="bg-accent/20 text-accent border-accent/50 w-fit">
                        {offer.niche}
                      </Badge>
                      {(offer.active_ads_count || 0) > 0 && (
                        <div className={`flex items-center gap-1 font-bold text-lg ${getAdCountColor(offer.active_ads_count || 0)}`}>
                          <Flame className="h-5 w-5" />
                          <span className="text-xl">{offer.active_ads_count}</span>
                          <span className="text-sm font-normal">anúncios</span>
                        </div>
                      )}
                    </div>
                    {offer.start_date && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <Calendar className="h-3 w-3" />
                        Início: {formatDate(offer.start_date)}
                      </p>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Button
                      className="w-full bg-accent hover:bg-accent/90"
                      onClick={() => window.open(offer.ad_library_link, "_blank")}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Ver Anúncios
                    </Button>
                    <Button
                      variant={savedOfferLinks.has(offer.ad_library_link) ? "default" : "outline"}
                      className={savedOfferLinks.has(offer.ad_library_link) 
                        ? "w-full bg-green-600 hover:bg-green-700 text-white" 
                        : "w-full border-accent/50 hover:bg-accent/10"
                      }
                      onClick={() => handleSaveOfferToTrack(offer)}
                      disabled={savingOfferId === offer.id}
                    >
                      {savedOfferLinks.has(offer.ad_library_link) ? (
                        <>
                          <Check className="h-4 w-4 mr-2" />
                          Oferta Salva
                        </>
                      ) : (
                        <>
                          <Bookmark className="h-4 w-4 mr-2" />
                          {savingOfferId === offer.id ? "Salvando..." : "Salvar Oferta"}
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="border-accent" onPaste={handlePaste}>
          <DialogHeader>
            <DialogTitle>Editar Oferta</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Imagem de Prévia (Cole com Ctrl+V)</Label>
              <div 
                className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:border-accent transition-colors"
              >
                {formImagePreview ? (
                  <div className="relative">
                    <img 
                      src={formImagePreview} 
                      alt="Preview" 
                      className="max-h-32 mx-auto rounded-lg object-cover"
                    />
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute top-0 right-0 h-6 w-6"
                      onClick={(e) => { e.stopPropagation(); removeImage(); }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    Cole uma imagem aqui (Ctrl+V)
                  </p>
                )}
              </div>
            </div>
            <div>
              <Label>Nome da Oferta *</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>
            <div>
              <Label>Link da Biblioteca de Anúncios *</Label>
              <Input
                value={formLink}
                onChange={(e) => setFormLink(e.target.value)}
              />
            </div>
            <div className="relative">
              <Label>Nicho *</Label>
              <Input
                value={formNiche}
                onChange={(e) => {
                  setFormNiche(e.target.value);
                  setShowNicheSuggestions(true);
                }}
                onFocus={() => setShowNicheSuggestions(true)}
                onBlur={() => setTimeout(() => setShowNicheSuggestions(false), 200)}
                placeholder="Digite o nicho..."
              />
              {showNicheSuggestions && filteredNicheSuggestions.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-background border border-border rounded-md shadow-lg max-h-40 overflow-auto">
                  {filteredNicheSuggestions.map((niche) => (
                    <button
                      key={niche}
                      type="button"
                      className="w-full px-3 py-2 text-left hover:bg-accent/10 transition-colors"
                      onClick={() => {
                        setFormNiche(niche);
                        setShowNicheSuggestions(false);
                      }}
                    >
                      {niche}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <Label>Total de Anúncios Ativos</Label>
              <Input
                type="number"
                value={formActiveAds}
                onChange={(e) => setFormActiveAds(parseInt(e.target.value) || 0)}
                min={0}
              />
            </div>
            <div>
              <Label>Data de Início</Label>
              <Input
                type="date"
                value={formStartDate}
                onChange={(e) => setFormStartDate(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="featured-toggle-edit" className="flex items-center gap-2">
                <Star className="h-4 w-4 text-yellow-500" />
                OFERTA FODA
              </Label>
              <Switch
                id="featured-toggle-edit"
                checked={formIsFeatured}
                onCheckedChange={setFormIsFeatured}
                className="data-[state=checked]:bg-green-500"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleEditOffer} disabled={submitting} className="bg-accent hover:bg-accent/90">
              {submitting ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="border-destructive">
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir a oferta "{selectedOffer?.name}"?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDeleteOffer} disabled={submitting}>
              {submitting ? "Excluindo..." : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ZapSpy;