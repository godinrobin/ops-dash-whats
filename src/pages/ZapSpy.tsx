import { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ExternalLink, Plus, Pencil, Trash2, EyeOff, Eye, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminStatus } from "@/hooks/useAdminStatus";
import { toast } from "sonner";

type OfferNiche = 'emagrecimento' | 'renda_extra' | 'relacionamento' | 'saude' | 'beleza' | 'educacao' | 'financeiro' | 'religioso' | 'pets' | 'outros';

interface ZapSpyOffer {
  id: string;
  name: string;
  ad_library_link: string;
  niche: OfferNiche;
  is_hidden: boolean;
  created_at: string;
}

const nicheLabels: Record<OfferNiche, string> = {
  emagrecimento: "Emagrecimento",
  renda_extra: "Renda Extra",
  relacionamento: "Relacionamento",
  saude: "Saúde",
  beleza: "Beleza",
  educacao: "Educação",
  financeiro: "Financeiro",
  religioso: "Religioso",
  pets: "Pets",
  outros: "Outros"
};

const nicheColors: Record<OfferNiche, string> = {
  emagrecimento: "bg-green-500/20 text-green-400 border-green-500/50",
  renda_extra: "bg-yellow-500/20 text-yellow-400 border-yellow-500/50",
  relacionamento: "bg-pink-500/20 text-pink-400 border-pink-500/50",
  saude: "bg-blue-500/20 text-blue-400 border-blue-500/50",
  beleza: "bg-purple-500/20 text-purple-400 border-purple-500/50",
  educacao: "bg-cyan-500/20 text-cyan-400 border-cyan-500/50",
  financeiro: "bg-emerald-500/20 text-emerald-400 border-emerald-500/50",
  religioso: "bg-amber-500/20 text-amber-400 border-amber-500/50",
  pets: "bg-orange-500/20 text-orange-400 border-orange-500/50",
  outros: "bg-gray-500/20 text-gray-400 border-gray-500/50"
};

const ZapSpy = () => {
  const { user } = useAuth();
  const { isAdmin } = useAdminStatus();
  const [offers, setOffers] = useState<ZapSpyOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNiche, setSelectedNiche] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  
  // Admin form state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState<ZapSpyOffer | null>(null);
  const [formName, setFormName] = useState("");
  const [formLink, setFormLink] = useState("");
  const [formNiche, setFormNiche] = useState<OfferNiche>("outros");
  const [submitting, setSubmitting] = useState(false);

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
    } catch (err) {
      console.error("Error loading offers:", err);
      toast.error("Erro ao carregar ofertas");
    } finally {
      setLoading(false);
    }
  };

  const handleAddOffer = async () => {
    if (!formName.trim() || !formLink.trim()) {
      toast.error("Preencha todos os campos");
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("zap_spy_offers")
        .insert({
          name: formName.trim(),
          ad_library_link: formLink.trim(),
          niche: formNiche,
          created_by: user?.id
        });

      if (error) throw error;

      toast.success("Oferta cadastrada com sucesso!");
      setAddDialogOpen(false);
      setFormName("");
      setFormLink("");
      setFormNiche("outros");
      loadOffers();
    } catch (err) {
      console.error("Error adding offer:", err);
      toast.error("Erro ao cadastrar oferta");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditOffer = async () => {
    if (!selectedOffer || !formName.trim() || !formLink.trim()) {
      toast.error("Preencha todos os campos");
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("zap_spy_offers")
        .update({
          name: formName.trim(),
          ad_library_link: formLink.trim(),
          niche: formNiche
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

  const openEditDialog = (offer: ZapSpyOffer) => {
    setSelectedOffer(offer);
    setFormName(offer.name);
    setFormLink(offer.ad_library_link);
    setFormNiche(offer.niche);
    setEditDialogOpen(true);
  };

  const openDeleteDialog = (offer: ZapSpyOffer) => {
    setSelectedOffer(offer);
    setDeleteDialogOpen(true);
  };

  const filteredOffers = offers.filter(offer => {
    const matchesNiche = selectedNiche === "all" || offer.niche === selectedNiche;
    const matchesSearch = offer.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesNiche && matchesSearch;
  });

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
                {Object.entries(nicheLabels).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {isAdmin && (
              <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-accent hover:bg-accent/90">
                    <Plus className="h-4 w-4 mr-2" />
                    Cadastrar Oferta
                  </Button>
                </DialogTrigger>
                <DialogContent className="border-accent">
                  <DialogHeader>
                    <DialogTitle>Cadastrar Nova Oferta</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>Nome da Oferta</Label>
                      <Input
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                        placeholder="Ex: Curso de Emagrecimento"
                      />
                    </div>
                    <div>
                      <Label>Link da Biblioteca de Anúncios</Label>
                      <Input
                        value={formLink}
                        onChange={(e) => setFormLink(e.target.value)}
                        placeholder="https://www.facebook.com/ads/library/..."
                      />
                    </div>
                    <div>
                      <Label>Nicho</Label>
                      <Select value={formNiche} onValueChange={(v) => setFormNiche(v as OfferNiche)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(nicheLabels).map(([key, label]) => (
                            <SelectItem key={key} value={key}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Cancelar</Button>
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
                    <Badge className={`w-fit ${nicheColors[offer.niche]}`}>
                      {nicheLabels[offer.niche]}
                    </Badge>
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
        <DialogContent className="border-accent">
          <DialogHeader>
            <DialogTitle>Editar Oferta</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome da Oferta</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>
            <div>
              <Label>Link da Biblioteca de Anúncios</Label>
              <Input
                value={formLink}
                onChange={(e) => setFormLink(e.target.value)}
              />
            </div>
            <div>
              <Label>Nicho</Label>
              <Select value={formNiche} onValueChange={(v) => setFormNiche(v as OfferNiche)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(nicheLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
