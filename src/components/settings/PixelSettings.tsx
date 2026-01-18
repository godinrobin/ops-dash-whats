import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/useSplashedToast";
import { Megaphone, Trash2, Plus, Edit2, Loader2, Check, X, AlertCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Pixel {
  id: string;
  pixel_id: string;
  access_token: string;
  name: string | null;
  page_id: string | null;
  is_active: boolean;
  created_at: string;
}

export function PixelSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [pixels, setPixels] = useState<Pixel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  
  // Form state
  const [newPixelId, setNewPixelId] = useState("");
  const [newAccessToken, setNewAccessToken] = useState("");
  const [newName, setNewName] = useState("");
  const [newPageId, setNewPageId] = useState("");
  
  // Edit state
  const [editPixelId, setEditPixelId] = useState("");
  const [editAccessToken, setEditAccessToken] = useState("");
  const [editName, setEditName] = useState("");
  const [editPageId, setEditPageId] = useState("");

  useEffect(() => {
    fetchPixels();
  }, [user]);

  const fetchPixels = async () => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from("user_facebook_pixels")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    
    if (error) {
      console.error("Error fetching pixels:", error);
      toast({ variant: "destructive", title: "Erro ao carregar pixels" });
    } else {
      setPixels(data || []);
    }
    setLoading(false);
  };

  const handleAddPixel = async () => {
    if (!user || !newPixelId.trim() || !newAccessToken.trim()) {
      toast({
        variant: "destructive",
        title: "Campos obrigatórios",
        description: "Preencha o ID do Pixel e o Token de Acesso",
      });
      return;
    }
    
    setSaving(true);
    
    try {
      const { error } = await supabase
        .from("user_facebook_pixels")
        .insert({
          user_id: user.id,
          pixel_id: newPixelId.trim(),
          access_token: newAccessToken.trim(),
          name: newName.trim() || null,
          page_id: newPageId.trim() || null,
          is_active: true,
        });
      
      if (error) throw error;
      
      toast({ title: "Pixel adicionado com sucesso!" });
      setNewPixelId("");
      setNewAccessToken("");
      setNewName("");
      setNewPageId("");
      fetchPixels();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erro ao adicionar pixel",
        description: error.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const startEditing = (pixel: Pixel) => {
    setEditingId(pixel.id);
    setEditPixelId(pixel.pixel_id);
    setEditAccessToken(pixel.access_token);
    setEditName(pixel.name || "");
    setEditPageId(pixel.page_id || "");
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditPixelId("");
    setEditAccessToken("");
    setEditName("");
    setEditPageId("");
  };

  const handleUpdatePixel = async (pixelId: string) => {
    if (!user || !editPixelId.trim() || !editAccessToken.trim()) {
      toast({ variant: "destructive", title: "Preencha ID e Token" });
      return;
    }
    
    setSaving(true);
    
    try {
      const { error } = await supabase
        .from("user_facebook_pixels")
        .update({
          pixel_id: editPixelId.trim(),
          access_token: editAccessToken.trim(),
          name: editName.trim() || null,
          page_id: editPageId.trim() || null,
        })
        .eq("id", pixelId)
        .eq("user_id", user.id);
      
      if (error) throw error;
      
      toast({ title: "Pixel atualizado!" });
      cancelEditing();
      fetchPixels();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erro", description: error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePixel = async () => {
    if (!user || !deleteConfirmId) return;
    
    setSaving(true);
    
    try {
      const { error } = await supabase
        .from("user_facebook_pixels")
        .delete()
        .eq("id", deleteConfirmId)
        .eq("user_id", user.id);
      
      if (error) throw error;
      
      toast({ title: "Pixel removido!" });
      setDeleteConfirmId(null);
      fetchPixels();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erro", description: error.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Add New Pixel Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-accent" />
            <CardTitle>Adicionar Pixel do Facebook</CardTitle>
          </div>
          <CardDescription>
            Configure seus pixels para disparar eventos de conversão automaticamente
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="pixel-name">Nome (opcional)</Label>
              <Input
                id="pixel-name"
                placeholder="Ex: Pixel Principal"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                disabled={saving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pixel-id">
                ID do Pixel <span className="text-destructive">*</span>
              </Label>
              <Input
                id="pixel-id"
                placeholder="Ex: 1234567890123456"
                value={newPixelId}
                onChange={(e) => setNewPixelId(e.target.value)}
                disabled={saving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="page-id">
                Page ID <span className="text-muted-foreground text-xs">(para pixels de mensagem)</span>
              </Label>
              <Input
                id="page-id"
                placeholder="Ex: 123456789012345"
                value={newPageId}
                onChange={(e) => setNewPageId(e.target.value)}
                disabled={saving}
              />
              <p className="text-xs text-muted-foreground">
                Obrigatório para atribuição de conversão via Click-to-WhatsApp
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="access-token">
                Token de Acesso <span className="text-destructive">*</span>
              </Label>
              <Input
                id="access-token"
                type="password"
                placeholder="Token de acesso do Facebook"
                value={newAccessToken}
                onChange={(e) => setNewAccessToken(e.target.value)}
                disabled={saving}
              />
            </div>
          </div>
          
          <Button
            onClick={handleAddPixel}
            disabled={saving || !newPixelId.trim() || !newAccessToken.trim()}
            className="w-full"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 mr-2" />
                Adicionar Pixel
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Existing Pixels */}
      {pixels.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pixels Configurados</CardTitle>
            <CardDescription>
              {pixels.length} pixel{pixels.length !== 1 ? "s" : ""} cadastrado{pixels.length !== 1 ? "s" : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {pixels.map((pixel) => (
              <div
                key={pixel.id}
                className="p-4 rounded-lg border border-border bg-secondary/20 space-y-3"
              >
                {editingId === pixel.id ? (
                  <>
                    <div className="space-y-3">
                      <Input
                        placeholder="Nome (opcional)"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        disabled={saving}
                      />
                      <Input
                        placeholder="ID do Pixel"
                        value={editPixelId}
                        onChange={(e) => setEditPixelId(e.target.value)}
                        disabled={saving}
                      />
                      <Input
                        placeholder="Page ID (para mensagens)"
                        value={editPageId}
                        onChange={(e) => setEditPageId(e.target.value)}
                        disabled={saving}
                      />
                      <Input
                        type="password"
                        placeholder="Token de Acesso"
                        value={editAccessToken}
                        onChange={(e) => setEditAccessToken(e.target.value)}
                        disabled={saving}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleUpdatePixel(pixel.id)}
                        disabled={saving || !editPixelId.trim() || !editAccessToken.trim()}
                        size="sm"
                        className="flex-1"
                      >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}
                        Salvar
                      </Button>
                      <Button
                        onClick={cancelEditing}
                        disabled={saving}
                        size="sm"
                        variant="outline"
                        className="flex-1"
                      >
                        <X className="w-4 h-4 mr-1" />
                        Cancelar
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {pixel.name || "Pixel sem nome"}
                          </span>
                          <Badge variant="secondary" className="text-xs">
                            {pixel.is_active ? "Ativo" : "Inativo"}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground font-mono">
                          ID: {pixel.pixel_id}
                        </p>
                        {pixel.page_id && (
                          <p className="text-xs text-muted-foreground">
                            Page ID: {pixel.page_id}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Token: ••••••{pixel.access_token.slice(-6)}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          onClick={() => startEditing(pixel)}
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          onClick={() => setDeleteConfirmId(pixel.id)}
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Info Card */}
      <Card className="border-accent/30 bg-accent/5">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 text-accent shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium">Como funciona?</p>
              <p className="text-xs text-muted-foreground">
                Quando uma venda for identificada no Tag Whats Cloud, o evento será disparado automaticamente 
                para todos os pixels configurados aqui. Você também pode disparar eventos manualmente no Automati-Zap.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Pixel</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este pixel? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletePixel}
              disabled={saving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
