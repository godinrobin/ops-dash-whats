import { useState, useEffect, useMemo } from "react";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ExternalLink, Plus, Pencil, Trash2, EyeOff, Eye, Search, Flame, Calendar, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminStatus } from "@/hooks/useAdminStatus";
import { toast } from "sonner";

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
}

const ZapSpy = () => {
  const { user } = useAuth();
  const { isAdmin } = useAdminStatus();
  const [offers, setOffers] = useState<ZapSpyOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNiche, setSelectedNiche] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<'none' | 'most_scaled' | 'oldest'>('none');
  
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
  const [submitting, setSubmitting] = useState(false);
  const [nicheSuggestions, setNicheSuggestions] = useState<string[]>([]);
  const [showNicheSuggestions, setShowNicheSuggestions] = useState(false);

  // Get unique niches from offers
  const availableNiches = useMemo(() => {
    const niches = [...new Set(offers.map(o => o.niche))].filter(Boolean);
    return niches.sort();
  }, [offers]);

  useEffect(() => {
    loadOffers();
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
      toast.error("Erro ao carregar ofertas");
    } finally {
      setLoading(false);
    }
  };

  const handleAddOffer = async () => {
    if (!formName.trim() || !formLink.trim() || !formNiche.trim()) {
      toast.error("Preencha todos os campos obrigatórios");
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
          created_by: user?.id
        });

      if (error) throw error;

      toast.success("Oferta cadastrada com sucesso!");
      setAddDialogOpen(false);
      resetForm();
      loadOffers();
    } catch (err) {
      console.error("Error adding offer:", err);
      toast.error("Erro ao cadastrar oferta");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditOffer = async () => {
    if (!selectedOffer || !formName.trim() || !formLink.trim() || !formNiche.trim()) {
      toast.error("Preencha todos os campos obrigatórios");
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
          image_url: imageUrl
        })
        .eq("id", selectedOffer.id);

      if (error) throw error;

      toast.success("Oferta atualizada com sucesso!");
      setEditDialogOpen(false);
      setSelectedOffer(null);
      loadOffers();
    } catch (err) {
      console.error("Error updating offer:", err);
      toast.error("Erro ao atualizar oferta");
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

      toast.success("Oferta removida com sucesso!");
      setDeleteDialogOpen(false);
      setSelectedOffer(null);
      loadOffers();
    } catch (err) {
      console.error("Error deleting offer:", err);
      toast.error("Erro ao remover oferta");
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

      toast.success(offer.is_hidden ? "Oferta visível" : "Oferta oculta");
      loadOffers();
    } catch (err) {
      console.error("Error toggling visibility:", err);
      toast.error("Erro ao alterar visibilidade");
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
              <Input
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
                <Card key={offer.id} className={`border-2 border-accent ${offer.is_hidden ? 'opacity-50' : ''}`}>
                  {offer.image_url && (
                    <div className="w-full h-40 overflow-hidden rounded-t-lg">
                      <img 
                        src={offer.image_url} 
                        alt={offer.name} 
                        className="w-full h-full object-cover"
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
                      {offer.active_ads_count > 0 && (
                        <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/50 flex items-center gap-1">
                          <Flame className="h-3 w-3" />
                          {offer.active_ads_count} anúncios
                        </Badge>
                      )}
                    </div>
                    {offer.start_date && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <Calendar className="h-3 w-3" />
                        Início: {formatDate(offer.start_date)}
                      </p>
                    )}
                  </CardHeader>
                  <CardContent>
                    <Button
                      className="w-full bg-accent hover:bg-accent/90"
                      onClick={() => window.open(offer.ad_library_link, "_blank")}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Ver Anúncios
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