import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { SystemLayout } from "@/components/layout/SystemLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ArrowLeft, Plus, Edit2, Trash2, Loader2, MessageSquare, Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffectiveUser } from "@/hooks/useEffectiveUser";
import { toast } from "sonner";
import automatizapIcon from "@/assets/automatizap-icon.png";
import { cn } from "@/lib/utils";
import { useActivityTracker } from "@/hooks/useActivityTracker";

interface QuickReply {
  id: string;
  shortcut: string;
  content: string;
  assigned_instances: string[];
  created_at: string;
}

interface Instance {
  id: string;
  instance_name: string;
  phone_number: string | null;
  label: string | null;
  status: string;
}

export default function QuickRepliesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { effectiveUserId } = useEffectiveUser();
  
  useActivityTracker('page_view', 'Automati-Zap Respostas Rápidas');

  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Dialog states
  const [editDialog, setEditDialog] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<string | null>(null);
  
  // Form states
  const [editingReply, setEditingReply] = useState<QuickReply | null>(null);
  const [formShortcut, setFormShortcut] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formInstances, setFormInstances] = useState<string[]>([]);
  const [selectAllInstances, setSelectAllInstances] = useState(false);

  useEffect(() => {
    const userId = effectiveUserId || user?.id;
    if (!userId) return;
    fetchData(userId);
  }, [user, effectiveUserId]);

  const fetchData = async (userId: string) => {
    setLoading(true);
    try {
      // Fetch instances
      const { data: instancesData } = await supabase
        .from('maturador_instances')
        .select('id, instance_name, phone_number, label, status')
        .eq('user_id', userId);
      
      if (instancesData) {
        setInstances(instancesData);
      }

      // Fetch quick replies
      const { data: repliesData } = await supabase
        .from('inbox_quick_replies')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      
      if (repliesData) {
        setQuickReplies(repliesData.map(r => ({
          id: r.id,
          shortcut: r.shortcut,
          content: r.content,
          assigned_instances: (r as any).assigned_instances || [],
          created_at: r.created_at,
        })));
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  const openNewDialog = () => {
    setEditingReply(null);
    setFormShortcut('');
    setFormContent('');
    setFormInstances([]);
    setSelectAllInstances(false);
    setEditDialog(true);
  };

  const openEditDialog = (reply: QuickReply) => {
    setEditingReply(reply);
    setFormShortcut(reply.shortcut);
    setFormContent(reply.content);
    setFormInstances(reply.assigned_instances);
    setSelectAllInstances(reply.assigned_instances.length === instances.length && instances.length > 0);
    setEditDialog(true);
  };

  const handleSelectAllChange = (checked: boolean) => {
    setSelectAllInstances(checked);
    if (checked) {
      setFormInstances(instances.map(i => i.id));
    } else {
      setFormInstances([]);
    }
  };

  const handleInstanceToggle = (instanceId: string) => {
    setFormInstances(prev => {
      if (prev.includes(instanceId)) {
        const newList = prev.filter(id => id !== instanceId);
        if (selectAllInstances) setSelectAllInstances(false);
        return newList;
      } else {
        const newList = [...prev, instanceId];
        if (newList.length === instances.length) setSelectAllInstances(true);
        return newList;
      }
    });
  };

  const handleSave = async () => {
    const userId = effectiveUserId || user?.id;
    if (!userId) return;

    if (!formShortcut.trim()) {
      toast.error('O atalho é obrigatório');
      return;
    }
    if (!formContent.trim()) {
      toast.error('O conteúdo é obrigatório');
      return;
    }

    setSaving(true);
    try {
      const replyData = {
        user_id: userId,
        shortcut: formShortcut.trim(),
        content: formContent.trim(),
        type: 'text',
        assigned_instances: formInstances,
      };

      if (editingReply) {
        // Update
        const { error } = await supabase
          .from('inbox_quick_replies')
          .update(replyData)
          .eq('id', editingReply.id);

        if (error) throw error;
        toast.success('Resposta rápida atualizada!');
      } else {
        // Create
        const { error } = await supabase
          .from('inbox_quick_replies')
          .insert(replyData);

        if (error) throw error;
        toast.success('Resposta rápida criada!');
      }

      setEditDialog(false);
      fetchData(userId);
    } catch (error) {
      console.error('Error saving quick reply:', error);
      toast.error('Erro ao salvar resposta rápida');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (replyId: string) => {
    const userId = effectiveUserId || user?.id;
    if (!userId) return;

    try {
      const { error } = await supabase
        .from('inbox_quick_replies')
        .delete()
        .eq('id', replyId);

      if (error) throw error;
      
      toast.success('Resposta rápida excluída!');
      setDeleteDialog(null);
      fetchData(userId);
    } catch (error) {
      console.error('Error deleting quick reply:', error);
      toast.error('Erro ao excluir resposta rápida');
    }
  };


  const getInstanceName = (instanceId: string) => {
    const instance = instances.find(i => i.id === instanceId);
    return instance?.label || instance?.instance_name || 'Desconhecido';
  };

  return (
    <SystemLayout>
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => navigate('/inbox')}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="flex items-center gap-3">
                <img src={automatizapIcon} alt="Automati-Zap" className="w-10 h-10" />
                <div>
                  <h1 className="text-2xl font-bold">Respostas Rápidas</h1>
                  <p className="text-muted-foreground">Crie atalhos para mensagens frequentes</p>
                </div>
              </div>
            </div>
            <Button onClick={openNewDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Resposta
            </Button>
          </div>

          {/* Content */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : quickReplies.length === 0 ? (
            <Card className="border-2 border-dashed border-accent">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <MessageSquare className="h-16 w-16 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Nenhuma resposta rápida</h3>
                <p className="text-muted-foreground text-center mb-6">
                  Crie respostas rápidas para agilizar seu atendimento.<br />
                  Digite "/" no chat para acessá-las.
                </p>
                <Button onClick={openNewDialog}>
                  <Plus className="h-4 w-4 mr-2" />
                  Criar Primeira Resposta
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {quickReplies.map((reply) => (
                <Card key={reply.id} className="border-2 border-accent">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4" />
                        <CardTitle className="text-base font-mono">/{reply.shortcut}</CardTitle>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditDialog(reply)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteDialog(reply.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground line-clamp-3 mb-3">
                      {reply.content || 'Sem conteúdo'}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {reply.assigned_instances.length === 0 ? (
                        <Badge variant="secondary" className="text-xs">Todas instâncias</Badge>
                      ) : reply.assigned_instances.length === instances.length ? (
                        <Badge variant="secondary" className="text-xs">Todas instâncias</Badge>
                      ) : (
                        reply.assigned_instances.slice(0, 2).map(instanceId => (
                          <Badge key={instanceId} variant="outline" className="text-xs">
                            <Smartphone className="h-3 w-3 mr-1" />
                            {getInstanceName(instanceId)}
                          </Badge>
                        ))
                      )}
                      {reply.assigned_instances.length > 2 && (
                        <Badge variant="outline" className="text-xs">
                          +{reply.assigned_instances.length - 2}
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Edit/Create Dialog */}
      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingReply ? 'Editar Resposta Rápida' : 'Nova Resposta Rápida'}</DialogTitle>
            <DialogDescription>
              Configure o atalho e conteúdo da resposta. Use "/" no chat para acessar.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Atalho</Label>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">/</span>
                <Input
                  placeholder="saudacao"
                  value={formShortcut}
                  onChange={(e) => setFormShortcut(e.target.value.replace(/\s/g, ''))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Conteúdo</Label>
              <Textarea
                placeholder="Olá! Como posso ajudar?"
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Label>Instâncias</Label>
              <div className="border rounded-lg p-3 space-y-2 max-h-40 overflow-y-auto">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="all-instances"
                    checked={selectAllInstances}
                    onCheckedChange={handleSelectAllChange}
                  />
                  <label htmlFor="all-instances" className="text-sm font-medium cursor-pointer">
                    Todas as instâncias
                  </label>
                </div>
                <div className="border-t pt-2 space-y-2">
                  {instances.map((instance) => (
                    <div key={instance.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={instance.id}
                        checked={formInstances.includes(instance.id)}
                        onCheckedChange={() => handleInstanceToggle(instance.id)}
                      />
                      <label htmlFor={instance.id} className="text-sm cursor-pointer">
                        {instance.label || instance.instance_name}
                        {instance.phone_number && (
                          <span className="text-muted-foreground ml-1">({instance.phone_number})</span>
                        )}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {editingReply ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteDialog} onOpenChange={() => setDeleteDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Resposta Rápida</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta resposta rápida? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteDialog && handleDelete(deleteDialog)}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SystemLayout>
  );
}