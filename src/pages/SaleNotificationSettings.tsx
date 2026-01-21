import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, Plus, Trash2, GripVertical, Eye, EyeOff, Save, Loader2, Info, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ColoredSwitch } from "@/components/ui/colored-switch";
import { useToast } from "@/hooks/useSplashedToast";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import { cn } from "@/lib/utils";
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

interface NotificationTemplate {
  id: string;
  user_id: string;
  title_template: string;
  body_template: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export default function SaleNotificationSettings() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [hideSaleValue, setHideSaleValue] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteTemplateId, setDeleteTemplateId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }
    fetchData();
  }, [user, navigate]);

  const fetchData = async () => {
    if (!user) return;
    
    try {
      // Fetch templates
      const { data: templatesData, error: templatesError } = await supabase
        .from("sale_notification_templates")
        .select("*")
        .eq("user_id", user.id)
        .order("sort_order", { ascending: true });
      
      if (templatesError) throw templatesError;
      
      // Fetch profile settings
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("hide_sale_value_in_notification")
        .eq("id", user.id)
        .single();
      
      if (profileError && profileError.code !== 'PGRST116') throw profileError;
      
      const DEFAULT_TITLE = "💰 Nova Venda!";
      const DEFAULT_BODY = "Parabéns! Você acabou de vender por R$ {valor}!";
      
      let finalTemplates = templatesData || [];
      
      // Check if the default template already exists (by checking title and body)
      const hasDefaultTemplate = finalTemplates.some(
        t => t.title_template === DEFAULT_TITLE && t.body_template === DEFAULT_BODY
      );
      
      // If default template doesn't exist, insert it at the beginning
      if (!hasDefaultTemplate) {
        const defaultTemplate = {
          user_id: user.id,
          title_template: DEFAULT_TITLE,
          body_template: DEFAULT_BODY,
          is_active: true,
          sort_order: -1, // Will be reordered below
        };
        
        const { data: newTemplate, error: insertError } = await supabase
          .from("sale_notification_templates")
          .insert(defaultTemplate)
          .select()
          .single();
        
        if (!insertError && newTemplate) {
          // Add default template at the beginning
          finalTemplates = [newTemplate, ...finalTemplates];
          
          // Update sort_order for all templates
          for (let i = 0; i < finalTemplates.length; i++) {
            await supabase
              .from("sale_notification_templates")
              .update({ sort_order: i })
              .eq("id", finalTemplates[i].id);
            finalTemplates[i].sort_order = i;
          }
        }
      }
      
      setTemplates(finalTemplates);
      setHideSaleValue(profileData?.hide_sale_value_in_notification || false);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erro", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleHideSaleValue = async () => {
    if (!user) return;
    setSaving(true);
    
    try {
      const newValue = !hideSaleValue;
      const { error } = await supabase
        .from("profiles")
        .update({ hide_sale_value_in_notification: newValue })
        .eq("id", user.id);
      
      if (error) throw error;
      
      setHideSaleValue(newValue);
      toast({
        title: newValue ? "Valor oculto" : "Valor visível",
        description: newValue 
          ? "O valor da venda não será exibido nas notificações" 
          : "O valor da venda será exibido nas notificações",
      });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erro", description: error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleAddTemplate = async () => {
    if (!user) return;
    setSaving(true);
    
    try {
      const newTemplate = {
        user_id: user.id,
        title_template: "💰 Nova Venda!",
        body_template: "Parabéns! Você acabou de vender por R$ {valor}!",
        is_active: true,
        sort_order: templates.length,
      };
      
      const { data, error } = await supabase
        .from("sale_notification_templates")
        .insert(newTemplate)
        .select()
        .single();
      
      if (error) throw error;
      
      setTemplates([...templates, data]);
      toast({ title: "Template adicionado!" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erro", description: error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateTemplate = async (template: NotificationTemplate, field: 'title_template' | 'body_template', value: string) => {
    // Update local state immediately for responsiveness
    setTemplates(prev => prev.map(t => 
      t.id === template.id ? { ...t, [field]: value } : t
    ));
  };

  const handleSaveTemplate = async (template: NotificationTemplate) => {
    setSaving(true);
    
    try {
      const { error } = await supabase
        .from("sale_notification_templates")
        .update({
          title_template: template.title_template,
          body_template: template.body_template,
        })
        .eq("id", template.id);
      
      if (error) throw error;
      
      toast({ title: "Template salvo!" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erro", description: error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleTemplateActive = async (template: NotificationTemplate) => {
    setSaving(true);
    
    try {
      const newValue = !template.is_active;
      const { error } = await supabase
        .from("sale_notification_templates")
        .update({ is_active: newValue })
        .eq("id", template.id);
      
      if (error) throw error;
      
      setTemplates(prev => prev.map(t => 
        t.id === template.id ? { ...t, is_active: newValue } : t
      ));
      
      toast({ title: newValue ? "Template ativado" : "Template desativado" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erro", description: error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTemplate = async () => {
    if (!deleteTemplateId) return;
    setSaving(true);
    
    try {
      const { error } = await supabase
        .from("sale_notification_templates")
        .delete()
        .eq("id", deleteTemplateId);
      
      if (error) throw error;
      
      setTemplates(prev => prev.filter(t => t.id !== deleteTemplateId));
      toast({ title: "Template removido" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erro", description: error.message });
    } finally {
      setSaving(false);
      setDeleteTemplateId(null);
    }
  };

  const handleReorder = async (newOrder: NotificationTemplate[]) => {
    setTemplates(newOrder);
    
    // Update sort_order in database
    const updates = newOrder.map((template, index) => ({
      id: template.id,
      sort_order: index,
    }));
    
    try {
      for (const update of updates) {
        await supabase
          .from("sale_notification_templates")
          .update({ sort_order: update.sort_order })
          .eq("id", update.id);
      }
    } catch (error: any) {
      console.error("Error updating order:", error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-b border-border z-50">
        <div className="container mx-auto px-4 h-14 md:h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/settings')}
              className="shrink-0"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <Shuffle className="h-5 w-5 text-accent" />
              <h1 className="text-lg font-semibold">Personalizar Notificações de Vendas</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="pt-20 pb-8 px-4 max-w-2xl mx-auto">
        {/* Info Card */}
        <Card className="mb-6 border-accent/30 bg-accent/5">
          <CardContent className="p-4 flex gap-3">
            <Info className="h-5 w-5 text-accent flex-shrink-0 mt-0.5" />
            <div className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-1">Como funciona?</p>
              <p>Crie vários templates de notificação e quando uma venda for detectada, um deles será escolhido <strong>aleatoriamente</strong> para ser enviado.</p>
              <p className="mt-2">Use <code className="bg-muted px-1 rounded">{'{valor}'}</code> para incluir o valor da venda dinamicamente.</p>
            </div>
          </CardContent>
        </Card>

        {/* Hide Value Setting */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {hideSaleValue ? (
                  <EyeOff className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <Eye className="h-5 w-5 text-accent" />
                )}
                <div>
                  <p className="font-medium">Ocultar valor da venda</p>
                  <p className="text-sm text-muted-foreground">
                    {hideSaleValue 
                      ? "O valor será ocultado nas notificações" 
                      : "O valor será exibido nas notificações"}
                  </p>
                </div>
              </div>
              <ColoredSwitch
                checked={hideSaleValue}
                onCheckedChange={handleToggleHideSaleValue}
                disabled={saving}
              />
            </div>
          </CardContent>
        </Card>

        {/* Templates Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Templates de Notificação</CardTitle>
                <CardDescription>
                  {templates.length === 0 
                    ? "Adicione templates personalizados"
                    : `${templates.filter(t => t.is_active).length} de ${templates.length} ativos`}
                </CardDescription>
              </div>
              <Button
                onClick={handleAddTemplate}
                disabled={saving}
                size="sm"
                className="gap-1"
              >
                <Plus className="h-4 w-4" />
                Adicionar
              </Button>
            </div>
          </CardHeader>
          
          <CardContent className="space-y-4">
            {templates.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Shuffle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>Nenhum template configurado</p>
                <p className="text-sm">Será usado o template padrão do sistema</p>
              </div>
            ) : (
              <Reorder.Group axis="y" values={templates} onReorder={handleReorder} className="space-y-4">
                <AnimatePresence>
                  {templates.map((template) => (
                    <Reorder.Item
                      key={template.id}
                      value={template}
                      className={cn(
                        "border rounded-lg p-4 bg-card transition-opacity",
                        !template.is_active && "opacity-60"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className="cursor-grab active:cursor-grabbing pt-2 text-muted-foreground hover:text-foreground transition-colors">
                          <GripVertical className="h-5 w-5" />
                        </div>
                        
                        <div className="flex-1 space-y-3">
                          <div className="space-y-1.5">
                            <Label htmlFor={`title-${template.id}`} className="text-xs text-muted-foreground">
                              Título
                            </Label>
                            <Input
                              id={`title-${template.id}`}
                              value={template.title_template}
                              onChange={(e) => handleUpdateTemplate(template, 'title_template', e.target.value)}
                              placeholder="Título da notificação"
                              className="font-medium"
                            />
                          </div>
                          
                          <div className="space-y-1.5">
                            <Label htmlFor={`body-${template.id}`} className="text-xs text-muted-foreground">
                              Mensagem
                            </Label>
                            <Textarea
                              id={`body-${template.id}`}
                              value={template.body_template}
                              onChange={(e) => handleUpdateTemplate(template, 'body_template', e.target.value)}
                              placeholder="Use {valor} para incluir o valor da venda"
                              rows={2}
                            />
                          </div>
                          
                          <div className="flex items-center justify-between pt-2">
                            <div className="flex items-center gap-2">
                              <ColoredSwitch
                                checked={template.is_active}
                                onCheckedChange={() => handleToggleTemplateActive(template)}
                                disabled={saving}
                              />
                              <span className="text-sm text-muted-foreground">
                                {template.is_active ? "Ativo" : "Inativo"}
                              </span>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              <Button
                                onClick={() => handleSaveTemplate(template)}
                                disabled={saving}
                                size="sm"
                                variant="outline"
                                className="gap-1"
                              >
                                <Save className="h-3.5 w-3.5" />
                                Salvar
                              </Button>
                              <Button
                                onClick={() => setDeleteTemplateId(template.id)}
                                disabled={saving}
                                size="sm"
                                variant="ghost"
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </Reorder.Item>
                  ))}
                </AnimatePresence>
              </Reorder.Group>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTemplateId} onOpenChange={() => setDeleteTemplateId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover template?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O template será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteTemplate}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
