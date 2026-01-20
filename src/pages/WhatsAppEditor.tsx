import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  ArrowLeft, Plus, RefreshCw, Loader2, Pencil, Upload, Trash2, 
  CheckCircle2, XCircle, Image, User, Smartphone, Settings
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffectiveUser } from "@/hooks/useEffectiveUser";
import { useActivityTracker } from "@/hooks/useActivityTracker";
import { toast } from "sonner";
import { formatPhoneDisplay } from "@/utils/phoneFormatter";
import { cn } from "@/lib/utils";

interface Instance {
  id: string;
  instance_name: string;
  phone_number: string | null;
  label: string | null;
  status: string;
  profile_name: string | null;
  profile_pic_url: string | null;
  uazapi_token: string | null;
}

export default function WhatsAppEditor() {
  useActivityTracker("page_visit", "Edição de WhatsApp");
  const navigate = useNavigate();
  const { user } = useAuth();
  const { effectiveUserId } = useEffectiveUser();

  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedInstances, setSelectedInstances] = useState<Set<string>>(new Set());
  
  // Edit modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingInstance, setEditingInstance] = useState<Instance | null>(null);
  const [isBulkEdit, setIsBulkEdit] = useState(false);
  const [newName, setNewName] = useState("");
  const [newImageBase64, setNewImageBase64] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removeImage, setRemoveImage] = useState(false);

  // File upload ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchInstances = useCallback(async () => {
    const userId = effectiveUserId || user?.id;
    if (!userId) return;

    try {
      // Fetch instances from all sources (maturador_instances has unified data)
      const { data, error } = await supabase
        .from('maturador_instances')
        .select('id, instance_name, phone_number, label, status, uazapi_token')
        .eq('user_id', userId)
        .not('uazapi_token', 'is', null)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Map to include profile info initially as null
      const instancesWithProfile = (data || []).map(inst => ({
        ...inst,
        profile_name: null as string | null,
        profile_pic_url: null as string | null,
      }));

      setInstances(instancesWithProfile);

      // Fetch profile info for connected instances from UazAPI
      const connectedInstances = instancesWithProfile.filter(i => i.status === 'connected' && i.uazapi_token);
      
      if (connectedInstances.length > 0) {
        fetchProfileInfo(connectedInstances);
      }
    } catch (error) {
      console.error('Error fetching instances:', error);
      toast.error('Erro ao carregar instâncias');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, effectiveUserId]);

  // Fetch profile info from UazAPI for connected instances via edge function
  const fetchProfileInfo = async (connectedInstances: Array<{ id: string; uazapi_token: string | null }>) => {
    try {
      const instanceIds = connectedInstances.map(i => i.id);
      
      const { data, error } = await supabase.functions.invoke('fetch-whatsapp-profiles', {
        body: { instanceIds },
      });

      if (error) {
        console.error('Error fetching profiles:', error);
        return;
      }

      const profiles = data?.profiles || [];
      
      // Update instances with profile info
      setInstances(prev => prev.map(inst => {
        const profile = profiles.find((p: any) => p.id === inst.id);
        if (profile) {
          return {
            ...inst,
            profile_name: profile.profileName,
            profile_pic_url: profile.profilePicUrl,
          };
        }
        return inst;
      }));
    } catch (error) {
      console.error('Error fetching profiles:', error);
    }
  };

  useEffect(() => {
    fetchInstances();
  }, [fetchInstances]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchInstances();
  };

  const handleSelectInstance = (instanceId: string, checked: boolean) => {
    const newSelected = new Set(selectedInstances);
    if (checked) {
      newSelected.add(instanceId);
    } else {
      newSelected.delete(instanceId);
    }
    setSelectedInstances(newSelected);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const connectedIds = instances
        .filter(i => i.status === 'connected')
        .map(i => i.id);
      setSelectedInstances(new Set(connectedIds));
    } else {
      setSelectedInstances(new Set());
    }
  };

  const openEditModal = (instance?: Instance) => {
    if (instance) {
      // Single edit
      setEditingInstance(instance);
      setIsBulkEdit(false);
      setNewName("");
      setNewImageBase64(null);
      setImagePreview(null);
      setRemoveImage(false);
    } else {
      // Bulk edit
      setEditingInstance(null);
      setIsBulkEdit(true);
      setNewName("");
      setNewImageBase64(null);
      setImagePreview(null);
      setRemoveImage(false);
    }
    setEditModalOpen(true);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Por favor, selecione uma imagem');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('A imagem deve ter no máximo 5MB');
      return;
    }

    // Convert to base64
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setNewImageBase64(base64);
      setImagePreview(base64);
      setRemoveImage(false);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file || !file.type.startsWith('image/')) {
      toast.error('Por favor, arraste uma imagem');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('A imagem deve ter no máximo 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setNewImageBase64(base64);
      setImagePreview(base64);
      setRemoveImage(false);
    };
    reader.readAsDataURL(file);
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (!file) continue;

        if (file.size > 5 * 1024 * 1024) {
          toast.error('A imagem deve ter no máximo 5MB');
          return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
          const base64 = event.target?.result as string;
          setNewImageBase64(base64);
          setImagePreview(base64);
          setRemoveImage(false);
        };
        reader.readAsDataURL(file);
        break;
      }
    }
  };

  const handleSaveProfile = async () => {
    if (!newName && !newImageBase64 && !removeImage) {
      toast.error('Informe um nome ou selecione uma imagem');
      return;
    }

    setSaving(true);
    try {
      const payload: any = {
        action: isBulkEdit ? 'bulk' : 'single',
      };

      if (isBulkEdit) {
        payload.instances = Array.from(selectedInstances);
      } else if (editingInstance) {
        payload.instanceId = editingInstance.id;
      }

      if (newName.trim()) {
        payload.name = newName.trim();
      }

      if (removeImage) {
        payload.imageBase64 = 'remove';
      } else if (newImageBase64) {
        payload.imageBase64 = newImageBase64;
      }

      const { data, error } = await supabase.functions.invoke('update-whatsapp-profile', {
        body: payload,
      });

      if (error) throw error;

      if (data.success) {
        const firstResult = data?.results?.[0];
        const requestedName = payload.name as string | undefined;
        const effectiveName = firstResult?.effectiveProfileName as string | null | undefined;

        toast.success(data.message || 'Perfil atualizado com sucesso');

        // If provider did not apply name, warn user (WhatsApp limits/privacy rules)
        if (requestedName && effectiveName && requestedName !== effectiveName) {
          toast.warning(`O WhatsApp manteve o nome atual: "${effectiveName}" (pode haver limite de alteração).`);
        }

        setEditModalOpen(false);
        setSelectedInstances(new Set());

        // Refresh list to reflect the real profile state
        setRefreshing(true);
        await fetchInstances();
      } else {
        toast.error(data.message || 'Alguns perfis falharam');
      }
    } catch (error: any) {
      console.error('Error updating profile:', error);
      toast.error(error.message || 'Erro ao atualizar perfil');
    } finally {
      setSaving(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'connected':
        return <Badge className="bg-green-500/20 text-green-500">Conectado</Badge>;
      case 'disconnected':
        return <Badge variant="secondary">Desconectado</Badge>;
      case 'connecting':
        return <Badge className="bg-yellow-500/20 text-yellow-500">Conectando</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const connectedCount = instances.filter(i => i.status === 'connected').length;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">Carregando instâncias...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Header />
      <div className="h-14 md:h-16" />
      <div className="min-h-screen bg-background p-4 md:p-6">
        <div className="container mx-auto max-w-6xl">
          {/* Header */}
          <div className="flex items-center gap-4 mb-6">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                <Settings className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Edição de WhatsApp</h1>
                <p className="text-sm text-muted-foreground">
                  Edite nome e foto de perfil sem acessar o celular
                </p>
              </div>
            </div>
          </div>

          {/* Stats & Actions */}
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 rounded-lg">
                <Smartphone className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{instances.length} números</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-green-500/10 rounded-lg">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-sm text-green-500">{connectedCount} conectados</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
                <RefreshCw className={cn("h-4 w-4 mr-2", refreshing && "animate-spin")} />
                Atualizar
              </Button>
              <Button onClick={() => navigate("/whatsapp-editor/add-number")}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Número
              </Button>
            </div>
          </div>

          {/* Bulk Actions */}
          {selectedInstances.size > 0 && (
            <Card className="mb-6 border-primary/50 bg-primary/5">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm">
                    <strong>{selectedInstances.size}</strong> número(s) selecionado(s)
                  </p>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setSelectedInstances(new Set())}
                    >
                      Limpar
                    </Button>
                    <Button 
                      size="sm" 
                      className="bg-green-600 hover:bg-green-700 text-white"
                      onClick={() => openEditModal()}
                    >
                      <Pencil className="h-4 w-4 mr-2" />
                      Editar em Massa
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Instances Grid */}
          {instances.length === 0 ? (
            <Card className="p-12 text-center">
              <Smartphone className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">Nenhum número cadastrado</h3>
              <p className="text-muted-foreground mb-4">
                Adicione seus números do WhatsApp para editar perfis
              </p>
              <Button onClick={() => navigate("/whatsapp-editor/add-number")}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Número
              </Button>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Select All */}
              <div className="flex items-center gap-2 px-4">
                <Checkbox
                  checked={selectedInstances.size === connectedCount && connectedCount > 0}
                  onCheckedChange={handleSelectAll}
                />
                <Label className="text-sm text-muted-foreground">
                  Selecionar todos os conectados
                </Label>
              </div>

              {/* Instances List */}
              <div className="grid gap-4">
                {instances.map((instance) => (
                  <Card 
                    key={instance.id} 
                    className={cn(
                      "transition-all",
                      selectedInstances.has(instance.id) && "ring-2 ring-primary",
                      instance.status !== 'connected' && "opacity-60"
                    )}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center gap-4">
                        {/* Checkbox */}
                        <Checkbox
                          checked={selectedInstances.has(instance.id)}
                          onCheckedChange={(checked) => handleSelectInstance(instance.id, !!checked)}
                          disabled={instance.status !== 'connected'}
                        />

                        {/* Avatar */}
                        <Avatar className="h-12 w-12 border-2 border-muted">
                          {instance.profile_pic_url && (
                            <AvatarImage 
                              src={instance.profile_pic_url} 
                              alt={instance.profile_name || instance.phone_number || ''}
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          )}
                          <AvatarFallback className="bg-muted">
                            <User className="h-5 w-5 text-muted-foreground" />
                          </AvatarFallback>
                        </Avatar>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium truncate">
                              {instance.profile_name || formatPhoneDisplay(instance.phone_number || instance.instance_name)}
                            </p>
                            {getStatusBadge(instance.status)}
                          </div>
                          {instance.phone_number && (
                            <p className="text-sm text-muted-foreground">
                              {formatPhoneDisplay(instance.phone_number)}
                            </p>
                          )}
                          {instance.label && instance.label !== instance.instance_name && (
                            <p className="text-xs text-muted-foreground">
                              Rótulo: {instance.label}
                            </p>
                          )}
                        </div>

                        {/* Actions */}
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => openEditModal(instance)}
                          disabled={instance.status !== 'connected'}
                        >
                          <Pencil className="h-4 w-4 mr-2" />
                          Editar
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="sm:max-w-md" onPaste={handlePaste}>
          <DialogHeader>
            <DialogTitle>
              {isBulkEdit 
                ? `Editar ${selectedInstances.size} números` 
                : `Editar ${editingInstance?.label || editingInstance?.phone_number || editingInstance?.instance_name}`
              }
            </DialogTitle>
            <DialogDescription>
              Altere o nome e/ou a foto de perfil do WhatsApp
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Name Input */}
            <div className="space-y-2">
              <Label>Nome do Perfil</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Digite o novo nome..."
                maxLength={25}
              />
              <p className="text-xs text-muted-foreground">
                Deixe em branco para manter o nome atual
              </p>
            </div>

            {/* Image Upload */}
            <div className="space-y-2">
              <Label>Foto de Perfil</Label>
              
              {/* Drop Zone */}
              <div
                className={cn(
                  "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
                  "hover:border-primary/50 hover:bg-primary/5",
                  imagePreview && "border-primary"
                )}
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
              >
                {imagePreview ? (
                  <div className="space-y-2">
                    <img 
                      src={imagePreview} 
                      alt="Preview" 
                      className="h-24 w-24 rounded-full mx-auto object-cover"
                    />
                    <p className="text-sm text-muted-foreground">
                      Clique para alterar
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Arraste uma imagem, cole (Ctrl+V) ou clique para upload
                    </p>
                  </div>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />

              {/* Remove Image Option */}
              {!imagePreview && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={removeImage}
                    onCheckedChange={(checked) => setRemoveImage(!!checked)}
                  />
                  <Label className="text-sm text-muted-foreground">
                    Remover foto de perfil atual
                  </Label>
                </div>
              )}

              {imagePreview && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setImagePreview(null);
                    setNewImageBase64(null);
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Remover imagem
                </Button>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              className="border-red-500/50 text-red-500 hover:bg-red-500/10"
              onClick={() => setEditModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button 
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={handleSaveProfile} 
              disabled={saving}
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Salvar
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
