import { useState, useEffect, useCallback } from 'react';
import { Node } from '@xyflow/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Trash2, Save, Settings, Copy, Plus, Minus } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ConditionEditor } from './ConditionEditor';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface PropertiesPanelProps {
  selectedNode: Node | null;
  onUpdateNode: (nodeId: string, data: Record<string, unknown>) => void;
  onDeleteNode: (nodeId: string) => void;
  onDuplicateNode: (nodeId: string) => void;
  onSave: () => void;
  triggerType?: 'keyword' | 'all' | 'schedule' | 'sale' | 'tag';
  triggerKeywords?: string[];
  triggerTags?: string[];
  keywordMatchType?: 'exact' | 'contains' | 'not_contains';
  pauseOtherFlows?: boolean;
  onUpdateFlowSettings?: (settings: { triggerType?: string; triggerKeywords?: string[]; triggerTags?: string[]; keywordMatchType?: string; pauseOtherFlows?: boolean }) => void;
  allNodes?: Node[];
}
// System variables that are always available (synchronized with backend)
const SYSTEM_VARIABLES = [
  'contactName',
  'saudacao_personalizada', // Dynamic greeting based on time of day (São Paulo timezone)
  'telefone'
];

// Function to sanitize file names for upload (removes accents and special characters)
const sanitizeFileName = (filename: string): string => {
  // Remove accents/diacritics
  const withoutAccents = filename.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // Replace spaces and special characters with underscores, keep dots and hyphens
  const sanitized = withoutAccents.replace(/[^a-zA-Z0-9.\-]/g, '_');
  // Remove multiple consecutive underscores
  return sanitized.replace(/_+/g, '_');
};
// Function to extract custom variables from all nodes in the flow
const extractCustomVariablesFromNodes = (nodes: Node[]): string[] => {
  const customVariables = new Set<string>();
  
  nodes.forEach((node) => {
    const nodeData = node.data as Record<string, unknown>;
    
    // Extract from setVariable nodes
    if (node.type === 'setVariable' && nodeData.variableName) {
      const varName = nodeData.variableName as string;
      if (!SYSTEM_VARIABLES.includes(varName)) {
        customVariables.add(varName);
      }
    }
    
    // Extract from waitInput nodes
    if (node.type === 'waitInput' && nodeData.variableName) {
      const varName = nodeData.variableName as string;
      if (!SYSTEM_VARIABLES.includes(varName)) {
        customVariables.add(varName);
      }
    }
    
    // Extract from condition nodes (from conditions array)
    if (node.type === 'condition' && nodeData.conditions && Array.isArray(nodeData.conditions)) {
      (nodeData.conditions as Array<{ type: string; variable?: string }>).forEach((condition) => {
        if (condition.type === 'variable' && condition.variable && !SYSTEM_VARIABLES.includes(condition.variable)) {
          customVariables.add(condition.variable);
        }
      });
    }
  });
  
  return Array.from(customVariables).sort();
};

export const PropertiesPanel = ({
  selectedNode,
  onUpdateNode,
  onDeleteNode,
  onDuplicateNode,
  onSave,
  triggerType = 'keyword',
  triggerKeywords = [],
  triggerTags = [],
  keywordMatchType = 'exact',
  pauseOtherFlows = false,
  onUpdateFlowSettings,
  allNodes = [],
}: PropertiesPanelProps) => {
  const { user } = useAuth();
  
  // State for condition variable management
  const [showNewVariableInput, setShowNewVariableInput] = useState(false);
  const [newVariableName, setNewVariableName] = useState('');
  const [dbCustomVariables, setDbCustomVariables] = useState<string[]>([]);
  const [pixelsList, setPixelsList] = useState<{id: string; pixel_id: string; name: string | null}[]>([]);
  
  // Extract custom variables from all nodes in the flow
  const flowCustomVariables = extractCustomVariablesFromNodes(allNodes);
  
  // Combined custom variables from DB and flow nodes
  const customVariables = [...new Set([...dbCustomVariables, ...flowCustomVariables])];

  // Fetch custom variables from database
  useEffect(() => {
    const fetchVariables = async () => {
      if (!user) return;
      
      const { data } = await supabase
        .from('inbox_custom_variables')
        .select('name')
        .eq('user_id', user.id);
      
      setDbCustomVariables(data?.map(v => v.name) || []);
    };
    
    fetchVariables();
  }, [user]);

  // Fetch pixels for Pixel node
  useEffect(() => {
    const fetchPixels = async () => {
      if (!user) return;
      
      const { data } = await supabase
        .from('user_facebook_pixels')
        .select('id, pixel_id, name')
        .eq('user_id', user.id)
        .eq('is_active', true);
      
      setPixelsList((data || []) as {id: string; pixel_id: string; name: string | null}[]);
    };
    
    fetchPixels();
  }, [user]);

  // Save variable to database when used in nodes
  const saveVariableToDb = useCallback(async (name: string) => {
    if (!user || !name.trim() || SYSTEM_VARIABLES.includes(name.trim())) return;
    
    try {
      await supabase
        .from('inbox_custom_variables')
        .upsert(
          { user_id: user.id, name: name.trim() },
          { onConflict: 'user_id,name' }
        );
      
      if (!dbCustomVariables.includes(name.trim())) {
        setDbCustomVariables(prev => [...prev, name.trim()]);
      }
    } catch (error) {
      console.error('Error saving variable:', error);
    }
  }, [user, dbCustomVariables]);

  // Save tag to database when used in tag node
  const saveTagToDb = useCallback(async (name: string) => {
    if (!user || !name.trim()) return;
    
    try {
      await supabase
        .from('inbox_tags')
        .upsert(
          { user_id: user.id, name: name.trim() },
          { onConflict: 'user_id,name', ignoreDuplicates: true }
        );
    } catch (error) {
      console.error('Error saving tag:', error);
    }
  }, [user]);

  // Reset new variable input when node changes
  useEffect(() => {
    setShowNewVariableInput(false);
    setNewVariableName('');
  }, [selectedNode?.id]);

  if (!selectedNode) {
    return (
      <div className="w-72 bg-background border-l border-border p-4 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Propriedades
          </h3>
          <Button size="sm" onClick={onSave} className="bg-green-500 hover:bg-green-600 text-white">
            <Save className="h-4 w-4 mr-1" />
            Salvar
          </Button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground text-center">
            Selecione um nó para editar suas propriedades
          </p>
        </div>
      </div>
    );
  }

  const nodeData = selectedNode.data as Record<string, unknown>;

  const renderProperties = () => {
    switch (selectedNode.type) {
      case 'start':
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Configure como este fluxo será acionado.
            </p>
            
            <div className="space-y-2">
              <Label>Tipo de Gatilho</Label>
              <Select
                value={triggerType}
                onValueChange={(value) => onUpdateFlowSettings?.({ triggerType: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="keyword">Palavra-chave</SelectItem>
                  <SelectItem value="all">Todas as mensagens</SelectItem>
                  <SelectItem value="sale">Venda</SelectItem>
                  <SelectItem value="tag">Etiqueta</SelectItem>
                </SelectContent>
              </Select>
              {triggerType === 'tag' && (
                <p className="text-xs text-muted-foreground">
                  O fluxo será acionado automaticamente quando uma das etiquetas for adicionada ao contato.
                </p>
              )}
            </div>

            {triggerType === 'keyword' && (
              <>
                <div className="space-y-2">
                  <Label>Tipo de Correspondência</Label>
                  <Select
                    value={keywordMatchType || 'exact'}
                    onValueChange={(value) => onUpdateFlowSettings?.({ keywordMatchType: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="exact">Palavra exata</SelectItem>
                      <SelectItem value="contains">Contém a palavra</SelectItem>
                      <SelectItem value="not_contains">Não contém a palavra</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {keywordMatchType === 'exact' && 'O fluxo inicia quando a mensagem for exatamente igual a uma das palavras-chave.'}
                    {keywordMatchType === 'contains' && 'O fluxo inicia quando a mensagem contiver uma das palavras-chave.'}
                    {keywordMatchType === 'not_contains' && 'O fluxo inicia quando a mensagem NÃO contiver nenhuma das palavras-chave.'}
                    {!keywordMatchType && 'O fluxo inicia quando a mensagem for exatamente igual a uma das palavras-chave.'}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Palavras-chave</Label>
                  <Textarea
                    placeholder="oi, olá, comprar..."
                    value={triggerKeywords.join(', ')}
                    onChange={(e) => {
                      const keywords = e.target.value.split(',').map(k => k.trim()).filter(Boolean);
                      onUpdateFlowSettings?.({ triggerKeywords: keywords });
                    }}
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground">
                    Separe por vírgula.
                  </p>
                </div>
              </>
            )}

            {triggerKeywords.length > 0 && triggerType === 'keyword' && (
              <div className="flex flex-wrap gap-1">
                {triggerKeywords.map((kw, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">
                    {kw}
                  </Badge>
                ))}
              </div>
            )}

            {/* Etiquetas gatilho */}
            {triggerType === 'tag' && (
              <div className="space-y-2">
                <Label>Etiquetas que Acionam o Fluxo</Label>
                <Textarea
                  placeholder="Lead, VIP, Interessado (separadas por vírgula)"
                  value={triggerTags.join(', ')}
                  onChange={(e) => {
                    const tags = e.target.value.split(',').map(t => t.trim()).filter(Boolean);
                    onUpdateFlowSettings?.({ triggerTags: tags });
                  }}
                  rows={2}
                />
                <p className="text-xs text-muted-foreground">
                  Separe as etiquetas por vírgula. Quando qualquer uma dessas etiquetas for adicionada ao contato, o fluxo será iniciado.
                </p>
              </div>
            )}

            {triggerTags.length > 0 && triggerType === 'tag' && (
              <div className="flex flex-wrap gap-1">
                {triggerTags.map((tag, i) => (
                  <Badge key={i} variant="outline" className="text-xs bg-orange-500/10 border-orange-500/50 text-orange-500">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}

            {/* Pausar outros fluxos - for sale and tag triggers */}
            {(triggerType === 'sale' || triggerType === 'tag') && (
              <div className="flex items-center justify-between p-3 border rounded-md bg-amber-500/10 border-amber-500/30">
                <div>
                  <Label className="flex items-center gap-2">
                    <span className="text-amber-500">⚡</span>
                    Pausar outros fluxos
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Pausa todos os outros fluxos ativos do contato para priorizar este fluxo
                  </p>
                </div>
                <Switch
                  checked={pauseOtherFlows}
                  onCheckedChange={(checked) => onUpdateFlowSettings?.({ pauseOtherFlows: checked })}
                  className={
                    pauseOtherFlows
                      ? 'data-[state=checked]:bg-green-500'
                      : 'data-[state=unchecked]:bg-red-500'
                  }
                />
              </div>
            )}
          </div>
        );

      case 'text':
        // Get all available variables: system + custom from DB + custom from nodes
        const getAvailableVariablesForText = () => {
          const nodeVariables = extractCustomVariablesFromNodes(allNodes);
          const allVariables = [...SYSTEM_VARIABLES, ...dbCustomVariables, ...nodeVariables];
          // Remove duplicates and sort
          return [...new Set(allVariables)].sort();
        };
        const textVariables = getAvailableVariablesForText();
        
        const insertVariable = (varName: string) => {
          const currentMessage = (nodeData.message as string) || '';
          onUpdateNode(selectedNode.id, { message: currentMessage + `{{${varName}}}` });
        };
        
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Mensagem</Label>
              <Textarea
                placeholder="Digite a mensagem..."
                value={(nodeData.message as string) || ''}
                onChange={(e) => onUpdateNode(selectedNode.id, { message: e.target.value })}
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Variáveis disponíveis</Label>
              <div className="flex flex-wrap gap-1">
                {textVariables.map((varName) => (
                  <Badge 
                    key={varName}
                    variant="secondary" 
                    className="cursor-pointer hover:bg-primary hover:text-primary-foreground text-xs"
                    onClick={() => insertVariable(varName)}
                  >
                    {`{{${varName}}}`}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Clique para inserir no texto
              </p>
            </div>
            
            {/* Presence/Typing indicator option */}
            <div className="space-y-3 pt-2 border-t border-border">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="showPresence"
                  checked={(nodeData.showPresence as boolean) || false}
                  onCheckedChange={(checked) => onUpdateNode(selectedNode.id, { showPresence: checked })}
                />
                <Label htmlFor="showPresence" className="text-sm cursor-pointer">
                  Mostrar "digitando..." antes de enviar
                </Label>
              </div>
              {(nodeData.showPresence as boolean) && (
                <div className="space-y-2 pl-6">
                  <Label className="text-xs">Duração (segundos)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={60}
                    value={(nodeData.presenceDelay as number) || 3}
                    onChange={(e) => onUpdateNode(selectedNode.id, { presenceDelay: Math.min(60, Math.max(1, parseInt(e.target.value) || 3)) })}
                    className="w-24 h-8"
                  />
                  <p className="text-xs text-muted-foreground">
                    1 a 60 segundos
                  </p>
                </div>
              )}
            </div>
          </div>
        );

      case 'aiText':
        // Get all available variables for AI Text: system + custom from DB + custom from nodes
        const getAvailableVariablesForAIText = () => {
          const nodeVariables = extractCustomVariablesFromNodes(allNodes);
          const allVariables = [...SYSTEM_VARIABLES, ...dbCustomVariables, ...nodeVariables];
          return [...new Set(allVariables)].sort();
        };
        const aiTextVariables = getAvailableVariablesForAIText();
        
        const insertVariableAIText = (varName: string) => {
          const currentMessage = (nodeData.message as string) || '';
          onUpdateNode(selectedNode.id, { message: currentMessage + `{{${varName}}}` });
        };
        
        return (
          <div className="space-y-4">
            <div className="bg-gradient-to-r from-violet-500/10 to-purple-500/10 border border-violet-500/20 rounded-lg p-3 mb-2">
              <p className="text-xs text-violet-400 flex items-center gap-2">
                <span className="text-sm">✨</span>
                A IA irá gerar variações automáticas do texto base para cada usuário, mantendo o mesmo sentido mas com palavras diferentes.
              </p>
            </div>
            
            <div className="space-y-2">
              <Label>Texto Base</Label>
              <Textarea
                placeholder="Digite o texto base que a IA irá variar..."
                value={(nodeData.message as string) || ''}
                onChange={(e) => onUpdateNode(selectedNode.id, { message: e.target.value })}
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                A IA vai manter o sentido do texto, mas alterará palavras e, se houver emojis, também os variará.
              </p>
            </div>
            
            <div className="space-y-2">
              <Label className="text-xs">Variáveis disponíveis</Label>
              <div className="flex flex-wrap gap-1">
                {aiTextVariables.map((varName) => (
                  <Badge 
                    key={varName}
                    variant="secondary" 
                    className="cursor-pointer hover:bg-primary hover:text-primary-foreground text-xs"
                    onClick={() => insertVariableAIText(varName)}
                  >
                    {`{{${varName}}}`}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Clique para inserir no texto
              </p>
            </div>
            
            {/* Presence/Typing indicator option */}
            <div className="space-y-3 pt-2 border-t border-border">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="showPresenceAI"
                  checked={(nodeData.showPresence as boolean) || false}
                  onCheckedChange={(checked) => onUpdateNode(selectedNode.id, { showPresence: checked })}
                />
                <Label htmlFor="showPresenceAI" className="text-sm cursor-pointer">
                  Mostrar "digitando..." antes de enviar
                </Label>
              </div>
              {(nodeData.showPresence as boolean) && (
                <div className="space-y-2 pl-6">
                  <Label className="text-xs">Duração (segundos)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={60}
                    value={(nodeData.presenceDelay as number) || 3}
                    onChange={(e) => onUpdateNode(selectedNode.id, { presenceDelay: Math.min(60, Math.max(1, parseInt(e.target.value) || 3)) })}
                    className="w-24 h-8"
                  />
                  <p className="text-xs text-muted-foreground">
                    1 a 60 segundos
                  </p>
                </div>
              )}
            </div>
          </div>
        );

      case 'image':
      case 'audio':
      case 'video':
      case 'document':
        const getMediaLabel = () => {
          switch (selectedNode.type) {
            case 'image': return 'Imagem';
            case 'audio': return 'Áudio';
            case 'video': return 'Vídeo';
            case 'document': return 'Documento';
            default: return 'Arquivo';
          }
        };
        
        const getAcceptType = () => {
          switch (selectedNode.type) {
            case 'image': return 'image/*';
            case 'audio': return 'audio/*';
            case 'video': return 'video/mp4,.mp4';
            case 'document': return '.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.ppt,.pptx';
            default: return '*/*';
          }
        };
        
        // Video upload validation constants
        const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
        const ALLOWED_VIDEO_FORMATS = ['mp4']; // UAZAPI only accepts MP4
        const ALLOWED_IMAGE_FORMATS = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
        const ALLOWED_AUDIO_FORMATS = ['mp3', 'wav', 'ogg', 'm4a', 'aac'];
        const ALLOWED_DOC_FORMATS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'csv', 'ppt', 'pptx'];

        const getAllowedFormats = () => {
          switch (selectedNode.type) {
            case 'video': return ALLOWED_VIDEO_FORMATS;
            case 'image': return ALLOWED_IMAGE_FORMATS;
            case 'audio': return ALLOWED_AUDIO_FORMATS;
            case 'document': return ALLOWED_DOC_FORMATS;
            default: return [];
          }
        };

        const formatFileSize = (bytes: number) => {
          if (bytes < 1024) return `${bytes} B`;
          if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
          return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        };

        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>
                Enviar {getMediaLabel()}
              </Label>
              <div className="space-y-3">
                <div className="border-2 border-dashed border-border rounded-lg p-4 text-center">
                  <Input
                    type="file"
                    accept={getAcceptType()}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      
                      // Validate file size
                      if (file.size > MAX_FILE_SIZE) {
                        toast.error(`Arquivo muito grande (máximo 50MB). Seu arquivo: ${formatFileSize(file.size)}`);
                        e.target.value = '';
                        return;
                      }
                      
                      // Validate file format
                      const extension = file.name.split('.').pop()?.toLowerCase();
                      const mimeType = file.type.split('/')[1]?.toLowerCase();
                      const allowedFormats = getAllowedFormats();
                      
                      if (allowedFormats.length > 0 && !allowedFormats.includes(extension || '') && !allowedFormats.includes(mimeType || '')) {
                        toast.error(`Formato não suportado. Use: ${allowedFormats.join(', ')}`);
                        e.target.value = '';
                        return;
                      }
                      
                      const { supabase } = await import('@/integrations/supabase/client');
                      const { data: { user } } = await supabase.auth.getUser();
                      if (!user) {
                        toast.error('Você precisa estar logado');
                        return;
                      }
                      
                      const loadingToast = toast.loading(`Enviando ${getMediaLabel().toLowerCase()} (${formatFileSize(file.size)})...`);
                      
                      try {
                        const sanitizedName = sanitizeFileName(file.name);
                        const fileName = `${user.id}/flow-media/${Date.now()}-${sanitizedName}`;
                        const { error } = await supabase.storage.from('video-clips').upload(fileName, file, {
                          cacheControl: '3600',
                          upsert: false
                        });
                        
                        if (error) {
                          console.error('Upload error:', error);
                          
                          // Provide specific error messages
                          if (error.message?.includes('exceeded')) {
                            toast.error('Limite de armazenamento excedido', { id: loadingToast });
                          } else if (error.message?.includes('network')) {
                            toast.error('Erro de conexão. Verifique sua internet e tente novamente.', { id: loadingToast });
                          } else {
                            toast.error(`Erro ao enviar: ${error.message || 'Tente novamente'}`, { id: loadingToast });
                          }
                          return;
                        }
                        
                        const { data: urlData } = supabase.storage.from('video-clips').getPublicUrl(fileName);
                        onUpdateNode(selectedNode.id, { 
                          mediaUrl: urlData.publicUrl,
                          fileName: file.name 
                        });
                        toast.success('Arquivo enviado!', { id: loadingToast });
                      } catch (err: any) {
                        console.error('Upload exception:', err);
                        toast.error(`Erro inesperado: ${err?.message || 'Tente novamente'}`, { id: loadingToast });
                      }
                    }}
                    className="cursor-pointer"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    Clique para selecionar um arquivo (máx 50MB)
                  </p>
                  {selectedNode.type === 'video' && (
                    <p className="text-xs text-yellow-500 font-medium">
                      ⚠️ Apenas arquivos MP4 são aceitos
                    </p>
                  )}
                </div>
                {(nodeData.mediaUrl as string) && (
                  <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-2 flex items-center gap-2">
                    <span className="text-green-500">✓</span>
                    <span className="text-xs text-green-500 truncate flex-1">
                      {(nodeData.fileName as string) || 'Arquivo carregado'}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                      onClick={() => onUpdateNode(selectedNode.id, { mediaUrl: '', fileName: '' })}
                    >
                      Remover
                    </Button>
                  </div>
                )}
              </div>
            </div>
            
            {/* Presence/Recording indicator option for audio */}
            {selectedNode.type === 'audio' && (
              <div className="space-y-3 pt-2 border-t border-border">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="showPresenceAudio"
                    checked={(nodeData.showPresence as boolean) || false}
                    onCheckedChange={(checked) => onUpdateNode(selectedNode.id, { showPresence: checked })}
                  />
                  <Label htmlFor="showPresenceAudio" className="text-sm cursor-pointer">
                    Mostrar "gravando áudio..." antes de enviar
                  </Label>
                </div>
                {(nodeData.showPresence as boolean) && (
                  <div className="space-y-2 pl-6">
                    <Label className="text-xs">Duração (segundos)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={60}
                      value={(nodeData.presenceDelay as number) || 3}
                      onChange={(e) => onUpdateNode(selectedNode.id, { presenceDelay: Math.min(60, Math.max(1, parseInt(e.target.value) || 3)) })}
                      className="w-24 h-8"
                    />
                    <p className="text-xs text-muted-foreground">
                      1 a 60 segundos
                    </p>
                  </div>
                )}
                
                {/* Send as forwarded option */}
                <div className="flex items-center gap-2 pt-2">
                  <Checkbox
                    id="sendAsForwarded"
                    checked={(nodeData.sendAsForwarded as boolean) || false}
                    onCheckedChange={(checked) => onUpdateNode(selectedNode.id, { sendAsForwarded: checked })}
                  />
                  <Label htmlFor="sendAsForwarded" className="text-sm cursor-pointer">
                    Enviar como encaminhado
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground pl-6">
                  O áudio aparecerá como "Encaminhado" no WhatsApp (estilo laranja)
                </p>
              </div>
            )}
            
            <div className="space-y-2">
              <Label>Legenda (opcional)</Label>
              <Textarea
                placeholder="Legenda..."
                value={(nodeData.caption as string) || ''}
                onChange={(e) => onUpdateNode(selectedNode.id, { caption: e.target.value })}
                rows={3}
                className="resize-y min-h-[80px]"
              />
            </div>
          </div>
        );

      case 'delay':
        const delayType = (nodeData.delayType as string) || 'fixed';
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tipo de Delay</Label>
              <Select
                value={delayType}
                onValueChange={(value) => onUpdateNode(selectedNode.id, { delayType: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">Tempo Fixo</SelectItem>
                  <SelectItem value="variable">Tempo Variável</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {delayType === 'fixed' ? (
              <div className="space-y-2">
                <Label>Tempo de Espera</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min={1}
                    value={(nodeData.delay as number) || 5}
                    onChange={(e) => onUpdateNode(selectedNode.id, { delay: parseInt(e.target.value) || 1 })}
                  />
                  <Select
                    value={(nodeData.unit as string) || 'seconds'}
                    onValueChange={(value) => onUpdateNode(selectedNode.id, { unit: value })}
                  >
                    <SelectTrigger className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="seconds">Segundos</SelectItem>
                      <SelectItem value="minutes">Minutos</SelectItem>
                      <SelectItem value="hours">Horas</SelectItem>
                      <SelectItem value="days">Dias</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Tempo Mínimo</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min={1}
                      value={(nodeData.minDelay as number) || 5}
                      onChange={(e) => onUpdateNode(selectedNode.id, { minDelay: parseInt(e.target.value) || 1 })}
                    />
                    <Select
                      value={(nodeData.unit as string) || 'seconds'}
                      onValueChange={(value) => onUpdateNode(selectedNode.id, { unit: value })}
                    >
                      <SelectTrigger className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="seconds">Segundos</SelectItem>
                        <SelectItem value="minutes">Minutos</SelectItem>
                        <SelectItem value="hours">Horas</SelectItem>
                        <SelectItem value="days">Dias</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Tempo Máximo</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min={1}
                      value={(nodeData.maxDelay as number) || 15}
                      onChange={(e) => onUpdateNode(selectedNode.id, { maxDelay: parseInt(e.target.value) || 1 })}
                    />
                    <span className="flex items-center text-sm text-muted-foreground w-28 pl-3">
                      {(nodeData.unit as string) === 'minutes' ? 'Minutos' : 
                       (nodeData.unit as string) === 'hours' ? 'Horas' : 
                       (nodeData.unit as string) === 'days' ? 'Dias' : 'Segundos'}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  O delay será aleatório entre o tempo mínimo e máximo
                </p>
              </div>
            )}
          </div>
        );

      case 'waitInput':
        const timeoutEnabled = (nodeData.timeoutEnabled as boolean) === true; // default false
        const timeoutValue = (nodeData.timeout as number) || 5;
        const timeoutUnit = (nodeData.timeoutUnit as string) || 'minutes';
        
        // Follow up settings
        const followUpEnabled = (nodeData.followUpEnabled as boolean) === true;
        const followUpDelay = (nodeData.followUpDelay as number) || 1;
        const followUpUnit = (nodeData.followUpUnit as string) || 'minutes';
        
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Salvar resposta em</Label>
              <Input
                placeholder="Nome da variável"
                value={(nodeData.variableName as string) || ''}
                onChange={(e) => onUpdateNode(selectedNode.id, { variableName: e.target.value })}
                onBlur={(e) => {
                  // Save variable to database when user finishes typing
                  if (e.target.value.trim()) {
                    saveVariableToDb(e.target.value.trim());
                  }
                }}
              />
            </div>
            
            {/* Timeout toggle */}
            <div className="space-y-3 pt-2 border-t border-border">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="timeoutEnabled"
                  checked={timeoutEnabled}
                  onCheckedChange={(checked) => {
                    onUpdateNode(selectedNode.id, { 
                      timeoutEnabled: checked,
                      // Disable follow up if timeout is disabled
                      ...(checked === false ? { followUpEnabled: false } : {})
                    });
                  }}
                />
                <Label htmlFor="timeoutEnabled" className="text-sm cursor-pointer">
                  Definir prazo para responder
                </Label>
              </div>
              
              {timeoutEnabled && (
                <div className="space-y-4 pl-6 animate-in slide-in-from-top-2 duration-200">
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Tempo máximo de espera (Timeout)</Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        min={1}
                        value={timeoutValue}
                        onChange={(e) => onUpdateNode(selectedNode.id, { timeout: parseInt(e.target.value) || 1 })}
                        className="w-20"
                      />
                      <Select
                        value={timeoutUnit}
                        onValueChange={(value) => onUpdateNode(selectedNode.id, { timeoutUnit: value })}
                      >
                        <SelectTrigger className="w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="seconds">Segundos</SelectItem>
                          <SelectItem value="minutes">Minutos</SelectItem>
                          <SelectItem value="hours">Horas</SelectItem>
                          <SelectItem value="days">Dias</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      O fluxo seguirá pela saída "Timeout" após este prazo sem resposta.
                    </p>
                  </div>
                  
                  {/* Follow Up section */}
                  <div className="space-y-3 pt-3 border-t border-border/50">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="followUpEnabled"
                        checked={followUpEnabled}
                        onCheckedChange={(checked) => onUpdateNode(selectedNode.id, { followUpEnabled: checked })}
                      />
                      <Label htmlFor="followUpEnabled" className="text-sm cursor-pointer text-yellow-500">
                        Habilitar Follow Up
                      </Label>
                    </div>
                    
                    {followUpEnabled && (
                      <div className="space-y-2 pl-6 animate-in slide-in-from-top-2 duration-200">
                        <Label className="text-muted-foreground">Tempo para Follow Up</Label>
                        <div className="flex gap-2">
                          <Input
                            type="number"
                            min={1}
                            value={followUpDelay}
                            onChange={(e) => onUpdateNode(selectedNode.id, { followUpDelay: parseInt(e.target.value) || 1 })}
                            className="w-20"
                          />
                          <Select
                            value={followUpUnit}
                            onValueChange={(value) => onUpdateNode(selectedNode.id, { followUpUnit: value })}
                          >
                            <SelectTrigger className="w-28">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="seconds">Segundos</SelectItem>
                              <SelectItem value="minutes">Minutos</SelectItem>
                              <SelectItem value="hours">Horas</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Se o usuário não responder neste tempo, o fluxo seguirá pela saída "Follow Up" e continuará aguardando até o timeout.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            
            {/* Visual guide for outputs */}
            {timeoutEnabled && (
              <div className="pt-2 border-t border-border space-y-1">
                <Label className="text-xs">Saídas do componente:</Label>
                <div className="text-xs space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-cyan-500"></div>
                    <span className="text-muted-foreground">Resposta recebida</span>
                  </div>
                  {followUpEnabled && (
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
                      <span className="text-muted-foreground">Follow Up (após {followUpDelay} {followUpUnit === 'seconds' ? 'seg' : followUpUnit === 'minutes' ? 'min' : 'h'})</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                    <span className="text-muted-foreground">Timeout (após {timeoutValue} {timeoutUnit === 'seconds' ? 'seg' : timeoutUnit === 'minutes' ? 'min' : timeoutUnit === 'hours' ? 'h' : 'd'})</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        );

      case 'condition':
        // Get current conditions from node data or migrate from legacy format
        const getConditions = () => {
          if (nodeData.conditions && Array.isArray(nodeData.conditions)) {
            return nodeData.conditions as Array<{
              id: string;
              type: 'variable' | 'tag';
              variable?: string;
              operator?: string;
              value?: string;
              tagName?: string;
              tagCondition?: 'has' | 'not_has';
            }>;
          }
          // Migrate legacy format
          if (nodeData.variable) {
            return [{
              id: 'legacy-1',
              type: 'variable' as const,
              variable: nodeData.variable as string,
              operator: (nodeData.operator as string) || 'equals',
              value: (nodeData.value as string) || '',
            }];
          }
          return [];
        };

        const currentConditions = getConditions();
        const currentLogicOperator = (nodeData.logicOperator as 'and' | 'or') || 'and';

        // When a new custom variable is added, it will automatically appear 
        // in the list once it's used in a condition, setVariable, or waitInput node
        const handleAddCustomVariable = (name: string) => {
          // No-op: variables are now automatically extracted from flow nodes
          // The variable will appear in the list once it's used in a condition
          console.log('Custom variable added:', name);
        };

        return (
          <div className="space-y-4">
            <ConditionEditor
              conditions={currentConditions}
              logicOperator={currentLogicOperator}
              customVariables={customVariables}
              onUpdateConditions={(conditions) => {
                onUpdateNode(selectedNode.id, { 
                  conditions,
                  // Clear legacy fields
                  variable: undefined,
                  operator: undefined,
                  value: undefined,
                });
              }}
              onUpdateLogicOperator={(operator) => {
                onUpdateNode(selectedNode.id, { logicOperator: operator });
              }}
              onAddCustomVariable={handleAddCustomVariable}
            />
            <p className="text-xs text-muted-foreground">
              O fluxo seguirá pela saída "Sim" se as condições forem verdadeiras, ou "Não" caso contrário.
            </p>
          </div>
        );

      case 'menu':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Mensagem do Menu</Label>
              <Textarea
                placeholder="Escolha uma opção..."
                value={(nodeData.message as string) || ''}
                onChange={(e) => onUpdateNode(selectedNode.id, { message: e.target.value })}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Opções (uma por linha)</Label>
              <Textarea
                placeholder="1. Opção 1\n2. Opção 2\n3. Opção 3"
                value={(nodeData.options as string) || ''}
                onChange={(e) => onUpdateNode(selectedNode.id, { options: e.target.value })}
                rows={4}
              />
            </div>
          </div>
        );

      case 'ai':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Prompt do Sistema</Label>
              <Textarea
                placeholder="Você é um assistente de vendas amigável..."
                value={(nodeData.systemPrompt as string) || ''}
                onChange={(e) => onUpdateNode(selectedNode.id, { systemPrompt: e.target.value })}
                rows={6}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              A IA usará GPT-4o-mini para responder às mensagens do cliente com base neste prompt.
            </p>
          </div>
        );

      case 'transfer':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Transferir para</Label>
              <Select
                value={(nodeData.transferTo as string) || 'human'}
                onValueChange={(value) => onUpdateNode(selectedNode.id, { transferTo: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="human">Atendente Humano</SelectItem>
                  <SelectItem value="department">Departamento</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Mensagem de Transferência</Label>
              <Input
                placeholder="Transferindo para um atendente..."
                value={(nodeData.message as string) || ''}
                onChange={(e) => onUpdateNode(selectedNode.id, { message: e.target.value })}
              />
            </div>
          </div>
        );

      case 'webhook':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>URL do Webhook</Label>
              <Input
                placeholder="https://..."
                value={(nodeData.url as string) || ''}
                onChange={(e) => onUpdateNode(selectedNode.id, { url: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Método</Label>
              <Select
                value={(nodeData.method as string) || 'POST'}
                onValueChange={(value) => onUpdateNode(selectedNode.id, { method: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="POST">POST</SelectItem>
                  <SelectItem value="GET">GET</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 'setVariable':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome da Variável</Label>
              <Input
                placeholder="nome_variavel"
                value={(nodeData.variableName as string) || ''}
                onChange={(e) => onUpdateNode(selectedNode.id, { variableName: e.target.value })}
                onBlur={(e) => {
                  // Save variable to database when user finishes typing
                  if (e.target.value.trim()) {
                    saveVariableToDb(e.target.value.trim());
                  }
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Valor</Label>
              <Input
                placeholder="Valor ou {{outra_variavel}}"
                value={(nodeData.value as string) || ''}
                onChange={(e) => onUpdateNode(selectedNode.id, { value: e.target.value })}
              />
            </div>
          </div>
        );

      case 'tag':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome da Tag</Label>
              <Input
                placeholder="cliente_vip"
                value={(nodeData.tagName as string) || ''}
                onChange={(e) => onUpdateNode(selectedNode.id, { tagName: e.target.value })}
                onBlur={(e) => {
                  // Save tag to database when user finishes typing
                  if (e.target.value.trim()) {
                    saveTagToDb(e.target.value.trim());
                  }
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Ação</Label>
              <Select
                value={(nodeData.action as string) || 'add'}
                onValueChange={(value) => onUpdateNode(selectedNode.id, { action: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="add">Adicionar</SelectItem>
                  <SelectItem value="remove">Remover</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 'end':
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Este nó marca o fim do fluxo.
            </p>
          </div>
        );

      case 'randomizer':
        interface Split {
          id: string;
          name: string;
          percentage: number;
        }
        
        const splits: Split[] = (nodeData.splits as Split[]) || [
          { id: 'A', name: 'A', percentage: 50 },
          { id: 'B', name: 'B', percentage: 50 },
        ];
        
        const totalPercentage = splits.reduce((sum, s) => sum + s.percentage, 0);
        const isValid = totalPercentage === 100;

        const addSplit = () => {
          const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
          const nextLetter = letters[splits.length] || `S${splits.length + 1}`;
          const newSplits = [...splits, { id: nextLetter, name: nextLetter, percentage: 0 }];
          onUpdateNode(selectedNode.id, { splits: newSplits });
        };

        const removeSplit = (index: number) => {
          if (splits.length <= 2) {
            toast.error('Mínimo de 2 splits');
            return;
          }
          const newSplits = splits.filter((_, i) => i !== index);
          onUpdateNode(selectedNode.id, { splits: newSplits });
        };

        const updateSplit = (index: number, field: 'name' | 'percentage', value: string | number) => {
          const newSplits = splits.map((s, i) => 
            i === index ? { ...s, [field]: field === 'percentage' ? Number(value) : value } : s
          );
          onUpdateNode(selectedNode.id, { splits: newSplits });
        };

        const distributeEvenly = () => {
          const evenPercentage = Math.floor(100 / splits.length);
          const remainder = 100 - (evenPercentage * splits.length);
          const newSplits = splits.map((s, i) => ({
            ...s,
            percentage: evenPercentage + (i === 0 ? remainder : 0),
          }));
          onUpdateNode(selectedNode.id, { splits: newSplits });
        };

        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Divide o fluxo aleatoriamente entre os splits com base nas porcentagens.
            </p>

            <div className="space-y-3">
              {splits.map((split, index) => (
                <div key={split.id} className="flex items-center gap-2">
                  <Input
                    value={split.name}
                    onChange={(e) => updateSplit(index, 'name', e.target.value)}
                    className="w-16 text-center"
                    placeholder="Nome"
                  />
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={split.percentage}
                    onChange={(e) => updateSplit(index, 'percentage', e.target.value)}
                    className="w-20 text-center"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => removeSplit(index)}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={addSplit} className="flex-1">
                <Plus className="h-4 w-4 mr-1" />
                Adicionar Split
              </Button>
              <Button size="sm" variant="outline" onClick={distributeEvenly}>
                Distribuir
              </Button>
            </div>

            <div className={`p-2 rounded text-sm text-center ${
              isValid 
                ? 'bg-green-500/20 text-green-500 border border-green-500/30' 
                : 'bg-red-500/20 text-red-500 border border-red-500/30'
            }`}>
              Total: {totalPercentage}% {isValid ? '✓' : '(deve ser 100%)'}
            </div>
          </div>
        );

      case 'paymentIdentifier': {
        const fakeDetectionEnabled = (nodeData.fakeDetectionEnabled as boolean) || false;
        const fakeDetectionRecipients = (nodeData.fakeDetectionRecipients as Array<{ name: string; cpf_cnpj: string }>) || [];
        
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Identifica se a mensagem do usuário contém um comprovante de pagamento PIX.
            </p>
            
            <div className="space-y-3">
              <Label className="text-xs text-muted-foreground uppercase">Verificar</Label>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="checkImage"
                  checked={(nodeData.checkImage as boolean) ?? true}
                  onCheckedChange={(checked) => onUpdateNode(selectedNode.id, { checkImage: checked })}
                />
                <Label htmlFor="checkImage" className="text-sm cursor-pointer">
                  Imagens
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="checkPdf"
                  checked={(nodeData.checkPdf as boolean) ?? true}
                  onCheckedChange={(checked) => onUpdateNode(selectedNode.id, { checkPdf: checked })}
                />
                <Label htmlFor="checkPdf" className="text-sm cursor-pointer">
                  PDFs/Documentos
                </Label>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="markAsPaid"
                  checked={(nodeData.markAsPaid as boolean) || false}
                  onCheckedChange={(checked) => onUpdateNode(selectedNode.id, { markAsPaid: checked })}
                />
                <Label htmlFor="markAsPaid" className="text-sm cursor-pointer">
                  Marcar contato como "pago" se comprovante for válido
                </Label>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Tentativas máximas</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={(nodeData.maxAttempts as number) || 3}
                onChange={(e) => onUpdateNode(selectedNode.id, { maxAttempts: parseInt(e.target.value) || 3 })}
              />
              <p className="text-xs text-muted-foreground">
                Número de mensagens que serão analisadas antes de ir para a saída "Não Pagou"
              </p>
            </div>


            <div className="border-t pt-4 mt-4">
              <Label className="text-xs text-muted-foreground uppercase mb-3 block">Delay de Sem Resposta</Label>
              <p className="text-xs text-muted-foreground mb-3">
                Se o usuário não enviar nenhuma mensagem dentro deste tempo, o fluxo seguirá pela saída "Sem Resposta".
              </p>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min={1}
                  max={nodeData.noResponseDelayUnit === 'seconds' ? 3600 : 60}
                  value={(nodeData.noResponseDelayValue as number) || 5}
                  onChange={(e) => onUpdateNode(selectedNode.id, { noResponseDelayValue: parseInt(e.target.value) || 5 })}
                  className="flex-1"
                />
                <Select
                  value={(nodeData.noResponseDelayUnit as string) || 'minutes'}
                  onValueChange={(value) => onUpdateNode(selectedNode.id, { noResponseDelayUnit: value })}
                >
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="seconds">Segundos</SelectItem>
                    <SelectItem value="minutes">Minutos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Máximo: 60 minutos (3600 segundos)
              </p>
            </div>

            {/* Fake Receipt Detection Section */}
            <div className={`border-t pt-4 mt-4 p-3 rounded-lg ${fakeDetectionEnabled ? 'bg-red-500/5 border-red-500/30' : 'bg-muted/30'}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Label className={`text-xs uppercase font-semibold ${fakeDetectionEnabled ? 'text-red-400' : 'text-muted-foreground'}`}>
                    Detecção de Comprovante Fake
                  </Label>
                </div>
                <Switch
                  checked={fakeDetectionEnabled}
                  onCheckedChange={(checked) => onUpdateNode(selectedNode.id, { fakeDetectionEnabled: checked })}
                  className={fakeDetectionEnabled ? 'data-[state=checked]:bg-emerald-500' : 'data-[state=unchecked]:bg-red-500/50'}
                />
              </div>
              
              {fakeDetectionEnabled && (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    O comprovante só será aceito se o destinatário corresponder a um dos recebedores cadastrados.
                  </p>
                  
                  {/* Recipients List */}
                  {fakeDetectionRecipients.length > 0 && (
                    <div className="space-y-2">
                      {fakeDetectionRecipients.map((recipient, index) => (
                        <div key={index} className="flex items-center gap-2 p-2 bg-background/50 rounded border">
                          <div className="flex-1 text-xs">
                            <div className="font-medium">{recipient.name}</div>
                            <div className="text-muted-foreground">{recipient.cpf_cnpj}</div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-red-500 hover:text-red-600"
                            onClick={() => {
                              const updated = fakeDetectionRecipients.filter((_, i) => i !== index);
                              onUpdateNode(selectedNode.id, { fakeDetectionRecipients: updated });
                            }}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* Add Recipient Form */}
                  <div className="space-y-2 p-2 bg-background/30 rounded border border-dashed">
                    <Input
                      placeholder="Nome do recebedor"
                      id={`recipient-name-${selectedNode.id}`}
                      className="h-8 text-xs"
                    />
                    <Input
                      placeholder="CPF ou CNPJ"
                      id={`recipient-cpf-${selectedNode.id}`}
                      className="h-8 text-xs"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full h-7 text-xs"
                      onClick={() => {
                        const nameInput = document.getElementById(`recipient-name-${selectedNode.id}`) as HTMLInputElement;
                        const cpfInput = document.getElementById(`recipient-cpf-${selectedNode.id}`) as HTMLInputElement;
                        if (nameInput?.value && cpfInput?.value) {
                          const updated = [...fakeDetectionRecipients, { name: nameInput.value, cpf_cnpj: cpfInput.value }];
                          onUpdateNode(selectedNode.id, { fakeDetectionRecipients: updated });
                          nameInput.value = '';
                          cpfInput.value = '';
                        }
                      }}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Adicionar Recebedor
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="p-2 rounded bg-muted/50 text-xs">
              <strong>Saídas:</strong>
              <div className="flex flex-col gap-1 mt-1">
                <span className="text-emerald-500">✓ Pagou - Comprovante identificado{fakeDetectionEnabled ? ' e destinatário validado' : ''}</span>
                <span className="text-amber-500">⏱ Sem Resposta - Nenhuma mensagem no tempo configurado</span>
                <span className="text-red-500">✗ Não Pagou - Tentativas esgotadas sem comprovante{fakeDetectionEnabled ? ' ou destinatário não corresponde' : ''}</span>
              </div>
            </div>
          </div>
        );
      }

      case 'sendPixKey':
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Envia um botão nativo do WhatsApp com sua chave PIX para pagamento.
            </p>
            
            <div className="space-y-2">
              <Label>Tipo da Chave PIX</Label>
              <Select
                value={(nodeData.pixType as string) || 'EVP'}
                onValueChange={(value) => onUpdateNode(selectedNode.id, { pixType: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CPF">CPF</SelectItem>
                  <SelectItem value="CNPJ">CNPJ</SelectItem>
                  <SelectItem value="PHONE">Telefone</SelectItem>
                  <SelectItem value="EMAIL">E-mail</SelectItem>
                  <SelectItem value="EVP">Chave Aleatória (EVP)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Chave PIX</Label>
              <Input
                placeholder="Sua chave PIX..."
                value={(nodeData.pixKey as string) || ''}
                onChange={(e) => onUpdateNode(selectedNode.id, { pixKey: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Nome do Recebedor</Label>
              <Input
                placeholder="Nome exibido para o cliente"
                value={(nodeData.pixName as string) || ''}
                onChange={(e) => onUpdateNode(selectedNode.id, { pixName: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Nome que aparecerá para o cliente no momento do pagamento
              </p>
            </div>
          </div>
        );

      case 'sendCharge':
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Envia uma cobrança nativa do WhatsApp com botão "Revisar e pagar".
            </p>
            
            <div className="space-y-2">
              <Label>Valor (R$) *</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="25,00"
                value={(nodeData.amount as number) || ''}
                onChange={(e) => onUpdateNode(selectedNode.id, { amount: parseFloat(e.target.value) || 0 })}
              />
            </div>

            <div className="space-y-2">
              <Label>Nome do Item/Produto *</Label>
              <Input
                placeholder="Ex: Sapatinho de Croche"
                value={(nodeData.itemName as string) || ''}
                onChange={(e) => onUpdateNode(selectedNode.id, { itemName: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Descrição (opcional)</Label>
              <Textarea
                placeholder="Descrição da cobrança..."
                value={(nodeData.description as string) || ''}
                onChange={(e) => onUpdateNode(selectedNode.id, { description: e.target.value })}
                rows={2}
              />
            </div>

            <div className="border-t pt-4 mt-4">
              <Label className="text-xs text-muted-foreground uppercase mb-3 block">Dados PIX para Recebimento *</Label>
              
              <div className="space-y-2">
                <Label>Tipo da Chave PIX</Label>
                <Select
                  value={(nodeData.pixType as string) || 'EVP'}
                  onValueChange={(value) => onUpdateNode(selectedNode.id, { pixType: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CPF">CPF</SelectItem>
                    <SelectItem value="CNPJ">CNPJ</SelectItem>
                    <SelectItem value="PHONE">Telefone</SelectItem>
                    <SelectItem value="EMAIL">E-mail</SelectItem>
                    <SelectItem value="EVP">Chave Aleatória (EVP)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 mt-2">
                <Label>Chave PIX *</Label>
                <Input
                  placeholder="Sua chave PIX..."
                  value={(nodeData.pixKey as string) || ''}
                  onChange={(e) => onUpdateNode(selectedNode.id, { pixKey: e.target.value })}
                />
              </div>

              <div className="space-y-2 mt-2">
                <Label>Nome do Recebedor *</Label>
                <Input
                  placeholder="Nome exibido para o cliente"
                  value={(nodeData.pixName as string) || ''}
                  onChange={(e) => onUpdateNode(selectedNode.id, { pixName: e.target.value })}
                />
              </div>
            </div>
          </div>
        );

      case 'call':
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Faz uma ligação breve para o contato. O telefone tocará, mas ao atender não haverá áudio - é apenas para chamar a atenção.
            </p>
            
            <div className="p-3 bg-amber-500/10 rounded-lg border border-amber-500/30">
              <p className="text-xs text-amber-500">
                <strong>Nota:</strong> Funciona apenas com UazAPI. A ligação é iniciada mas não há comunicação de voz real.
              </p>
            </div>
          </div>
        );

      case 'interactiveBlock':
        const interactionType = (nodeData.interactionType as string) || 'button';
        const interactiveChoices = (nodeData.choices as string[]) || [];
        
        const addInteractiveChoice = () => {
          const newChoices = [...interactiveChoices, ''];
          onUpdateNode(selectedNode.id, { choices: newChoices });
        };
        
        const removeInteractiveChoice = (index: number) => {
          const newChoices = interactiveChoices.filter((_, i) => i !== index);
          onUpdateNode(selectedNode.id, { choices: newChoices });
        };
        
        const updateInteractiveChoice = (index: number, value: string) => {
          const newChoices = interactiveChoices.map((c, i) => i === index ? value : c);
          onUpdateNode(selectedNode.id, { choices: newChoices });
        };
        
        const getInteractionTypeDescription = () => {
          switch (interactionType) {
            case 'button':
              return 'Cria botões clicáveis para ações rápidas.';
            case 'imageButton':
              return 'Envia uma imagem com botões interativos.';
            case 'list':
              return 'Cria um menu de lista com seções organizadas.';
            default:
              return '';
          }
        };
        
        const getChoicePlaceholder = () => {
          switch (interactionType) {
            case 'button':
              return 'Texto do Botão';
            case 'imageButton':
              return 'Texto do Botão';
            case 'list':
              return 'Texto do Menu';
            default:
              return 'Opção';
          }
        };
        
        const getChoiceHint = () => {
          switch (interactionType) {
            case 'button':
              return '';
            case 'imageButton':
              return '';
            case 'list':
              return '';
            default:
              return '';
          }
        };
        
        return (
          <div className="space-y-4">
            <div className="bg-gradient-to-r from-fuchsia-500/10 to-pink-500/10 border border-fuchsia-500/20 rounded-lg p-3 mb-2">
              <p className="text-xs text-fuchsia-400">
                Mensagem Interativa permite enviar mensagens com interações nativas do WhatsApp.
                Cada opção gera uma saída no fluxo.
              </p>
            </div>
            
            <div className="space-y-2">
              <Label>Tipo de Interação</Label>
              <Select
                value={interactionType}
                onValueChange={(value) => onUpdateNode(selectedNode.id, { interactionType: value, choices: [] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="button">🔘 Mensagem com Botões</SelectItem>
                  <SelectItem value="imageButton">🖼️ Imagem com Botões</SelectItem>
                  <SelectItem value="list">📋 Menu Lista</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{getInteractionTypeDescription()}</p>
            </div>
            
            <div className="space-y-2">
              <Label>Texto Principal *</Label>
              <Textarea
                placeholder="Digite a mensagem que acompanha a interação..."
                value={(nodeData.text as string) || ''}
                onChange={(e) => onUpdateNode(selectedNode.id, { text: e.target.value })}
                rows={3}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Texto do Rodapé (opcional)</Label>
              <Input
                placeholder="Rodapé da mensagem"
                value={(nodeData.footerText as string) || ''}
                onChange={(e) => onUpdateNode(selectedNode.id, { footerText: e.target.value })}
              />
            </div>
            
            {interactionType === 'imageButton' && (
              <div className="space-y-2">
                <Label>Imagem *</Label>
                <div className="flex flex-col gap-2">
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      
                      toast.info('Fazendo upload da imagem...');
                      
                      const fileName = sanitizeFileName(file.name);
                      const filePath = `flow-media/${user?.id}/${Date.now()}-${fileName}`;
                      
                      const { data: uploadData, error } = await supabase.storage
                        .from('inbox-media')
                        .upload(filePath, file, { upsert: true });
                      
                      if (error) {
                        console.error('Upload error:', error);
                        toast.error(`Erro ao fazer upload: ${error.message}`);
                        return;
                      }
                      
                      console.log('Upload success:', uploadData);
                      
                      const { data: publicUrlData } = supabase.storage
                        .from('inbox-media')
                        .getPublicUrl(filePath);
                      
                      onUpdateNode(selectedNode.id, { imageUrl: publicUrlData.publicUrl });
                      toast.success('Imagem carregada com sucesso!');
                    }}
                    className="cursor-pointer"
                  />
                  {(nodeData.imageUrl as string) ? (
                    <div className="relative">
                      <img 
                        src={nodeData.imageUrl as string} 
                        alt="Preview" 
                        className="max-h-32 rounded-lg border border-border"
                      />
                      <p className="text-xs text-muted-foreground mt-1 truncate max-w-full">
                        {(nodeData.imageUrl as string).split('/').pop()}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Nenhuma imagem selecionada</p>
                  )}
                </div>
              </div>
            )}
            
            {interactionType === 'list' && (
              <div className="space-y-2">
                <Label>Texto do Botão da Lista *</Label>
                <Input
                  placeholder="Ver opções"
                  value={(nodeData.listButton as string) || ''}
                  onChange={(e) => onUpdateNode(selectedNode.id, { listButton: e.target.value })}
                  onBlur={() => {
                    // Auto-fill with "Ver opções" if empty on blur
                    if (!(nodeData.listButton as string)?.trim()) {
                      onUpdateNode(selectedNode.id, { listButton: 'Ver opções' });
                    }
                  }}
                />
              </div>
            )}
            
            <div className="space-y-2 border-t pt-4">
              <div className="flex items-center justify-between">
                <Label>Opções *</Label>
                <Button size="sm" variant="outline" onClick={addInteractiveChoice}>
                  <Plus className="h-3 w-3 mr-1" />
                  Adicionar
                </Button>
              </div>
              
              <div className="space-y-2">
                {interactiveChoices.map((choice, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      placeholder={getChoicePlaceholder()}
                      value={choice}
                      onChange={(e) => updateInteractiveChoice(index, e.target.value)}
                      className="flex-1"
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-9 w-9 shrink-0"
                      onClick={() => removeInteractiveChoice(index)}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {interactiveChoices.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    Clique em "Adicionar" para criar opções
                  </p>
                )}
              </div>
              
              {getChoiceHint() && (
                <p className="text-xs text-muted-foreground">{getChoiceHint()}</p>
              )}
            </div>
            
            <div className="p-2 rounded bg-amber-500/10 border border-amber-500/30 text-xs text-amber-400">
              <strong>Nota:</strong> Podem não aparecer corretamente no WhatsApp Web, apenas no dispositivo mobile.
            </div>
          </div>
        );

      case 'pixel':
        // Get available variables for value input
        const getAvailableVariablesForPixel = () => {
          const nodeVariables = extractCustomVariablesFromNodes(allNodes);
          const allVariables = [...SYSTEM_VARIABLES, ...dbCustomVariables, ...nodeVariables, 'event_value'];
          return [...new Set(allVariables)].sort();
        };
        const pixelVariables = getAvailableVariablesForPixel();
        
        const insertPixelVariable = (varName: string) => {
          const currentValue = (nodeData.eventValue as string) || '';
          onUpdateNode(selectedNode.id, { eventValue: currentValue + `{{${varName}}}` });
        };
        
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Pixel *</Label>
              <Select
                value={(nodeData.pixelId as string) || ''}
                onValueChange={(value) => {
                  if (value === '__ALL_PIXELS__') {
                    onUpdateNode(selectedNode.id, { 
                      pixelId: '__ALL_PIXELS__',
                      pixelName: 'Todos os Pixels',
                      tryAllPixels: true
                    });
                  } else {
                    const pixel = pixelsList.find(p => p.pixel_id === value);
                    onUpdateNode(selectedNode.id, { 
                      pixelId: value,
                      pixelName: pixel?.name || null,
                      tryAllPixels: false
                    });
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um pixel..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__ALL_PIXELS__">
                    <span className="flex items-center gap-2">
                      <span className="text-blue-500">🔄</span>
                      Todos os Pixels (tenta até acertar)
                    </span>
                  </SelectItem>
                  {pixelsList.map((pixel) => (
                    <SelectItem key={pixel.id} value={pixel.pixel_id}>
                      {pixel.name || `Pixel ${pixel.pixel_id.slice(-6)}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(nodeData.pixelId as string) === '__ALL_PIXELS__' && (
                <p className="text-xs text-blue-400">
                  O sistema tentará enviar para cada pixel até encontrar o correto.
                </p>
              )}
              {pixelsList.length === 0 && (
                <p className="text-xs text-amber-500">
                  Nenhum pixel configurado. Configure em Configurações → Pixel do Facebook.
                </p>
              )}
            </div>
            
            <div className="space-y-2">
              <Label>Evento *</Label>
              <Select
                value={(nodeData.eventType as string) || 'Purchase'}
                onValueChange={(value) => onUpdateNode(selectedNode.id, { eventType: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Purchase">Compra (Purchase)</SelectItem>
                  <SelectItem value="Lead">Lead</SelectItem>
                  <SelectItem value="InitiateCheckout">Iniciar Checkout (InitiateCheckout)</SelectItem>
                  <SelectItem value="AddToCart">Adicionar ao Carrinho (AddToCart)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {['Purchase', 'InitiateCheckout', 'AddToCart'].includes((nodeData.eventType as string) || 'Purchase') && (
              <div className="space-y-2">
                <Label>Valor do Evento</Label>
                <Input
                  type="text"
                  placeholder="Ex: 97.00 ou {{event_value}}"
                  value={(nodeData.eventValue as string) || ''}
                  onChange={(e) => onUpdateNode(selectedNode.id, { eventValue: e.target.value })}
                />
                <div className="flex flex-wrap gap-1 mt-1">
                  {pixelVariables.slice(0, 5).map((varName) => (
                    <Badge 
                      key={varName}
                      variant="secondary" 
                      className="cursor-pointer hover:bg-primary hover:text-primary-foreground text-xs"
                      onClick={() => insertPixelVariable(varName)}
                    >
                      {`{{${varName}}}`}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Use variáveis como {`{{event_value}}`} ou valor fixo. Deixe vazio para R$0.
                </p>
              </div>
            )}
            
          </div>
        );

      case 'notifyAdmin':
        // Get all available variables for message customization
        const getAvailableVariablesForNotify = () => {
          const nodeVariables = extractCustomVariablesFromNodes(allNodes);
          const allVariables = [...SYSTEM_VARIABLES, ...dbCustomVariables, ...nodeVariables];
          return [...new Set(allVariables)].sort();
        };
        const notifyVariables = getAvailableVariablesForNotify();
        
        const insertNotifyVariable = (varName: string, field: 'message' | 'pushTitle' | 'pushBody') => {
          const currentValue = (nodeData[field] as string) || '';
          onUpdateNode(selectedNode.id, { [field]: currentValue + `{{${varName}}}` });
        };
        
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tipo de Notificação *</Label>
              <Select
                value={(nodeData.notificationType as string) || ''}
                onValueChange={(value) => onUpdateNode(selectedNode.id, { notificationType: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o tipo..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="push">Notificação Push</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {(nodeData.notificationType as string) === 'whatsapp' && (
              <>
                <div className="space-y-2">
                  <Label>Número de Destino *</Label>
                  <Input
                    placeholder="5511999999999"
                    value={(nodeData.targetPhone as string) || ''}
                    onChange={(e) => onUpdateNode(selectedNode.id, { targetPhone: e.target.value.replace(/\D/g, '') })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Número com DDI + DDD (ex: 5511999999999)
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label>Mensagem *</Label>
                  <Textarea
                    placeholder="Escreva a mensagem para o admin..."
                    value={(nodeData.message as string) || ''}
                    onChange={(e) => onUpdateNode(selectedNode.id, { message: e.target.value })}
                    rows={4}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label className="text-xs">Variáveis disponíveis</Label>
                  <div className="flex flex-wrap gap-1">
                    {notifyVariables.map((varName) => (
                      <Badge 
                        key={varName}
                        variant="secondary" 
                        className="cursor-pointer hover:bg-primary hover:text-primary-foreground text-xs"
                        onClick={() => insertNotifyVariable(varName, 'message')}
                      >
                        {`{{${varName}}}`}
                      </Badge>
                    ))}
                  </div>
                </div>
              </>
            )}
            
            {(nodeData.notificationType as string) === 'push' && (
              <>
                <div className="space-y-2">
                  <Label>Título da Notificação *</Label>
                  <Input
                    placeholder="Título da notificação push..."
                    value={(nodeData.pushTitle as string) || ''}
                    onChange={(e) => onUpdateNode(selectedNode.id, { pushTitle: e.target.value })}
                  />
                  <div className="flex flex-wrap gap-1 mt-1">
                    {notifyVariables.slice(0, 3).map((varName) => (
                      <Badge 
                        key={varName}
                        variant="secondary" 
                        className="cursor-pointer hover:bg-primary hover:text-primary-foreground text-xs"
                        onClick={() => insertNotifyVariable(varName, 'pushTitle')}
                      >
                        {`{{${varName}}}`}
                      </Badge>
                    ))}
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label>Texto da Notificação *</Label>
                  <Textarea
                    placeholder="Texto da notificação push..."
                    value={(nodeData.pushBody as string) || ''}
                    onChange={(e) => onUpdateNode(selectedNode.id, { pushBody: e.target.value })}
                    rows={3}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label className="text-xs">Variáveis disponíveis</Label>
                  <div className="flex flex-wrap gap-1">
                    {notifyVariables.map((varName) => (
                      <Badge 
                        key={varName}
                        variant="secondary" 
                        className="cursor-pointer hover:bg-primary hover:text-primary-foreground text-xs"
                        onClick={() => insertNotifyVariable(varName, 'pushBody')}
                      >
                        {`{{${varName}}}`}
                      </Badge>
                    ))}
                  </div>
                </div>
                
                <div className="p-2 rounded bg-blue-500/10 border border-blue-500/30 text-xs text-blue-400">
                  <strong>Nota:</strong> A notificação push será enviada para o usuário atual (dono da instância).
                </div>
              </>
            )}
            
            {!(nodeData.notificationType as string) && (
              <p className="text-xs text-muted-foreground text-center py-4">
                Selecione o tipo de notificação para configurar
              </p>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="w-72 bg-background border-l border-border p-4 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Settings className="h-4 w-4" />
          Propriedades
        </h3>
        <Button size="sm" onClick={onSave} className="bg-green-500 hover:bg-green-600 text-white">
          <Save className="h-4 w-4 mr-1" />
          Salvar
        </Button>
      </div>

      <div className="space-y-4 flex-1 overflow-y-auto">
        <div className="space-y-2">
          <Label>Tipo</Label>
          <div className="text-sm text-muted-foreground capitalize">
            {selectedNode.type}
          </div>
        </div>

        {renderProperties()}
      </div>

      {selectedNode.type !== 'start' && (
        <div className="flex gap-2 mt-4 mb-6 pb-4">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => onDuplicateNode(selectedNode.id)}
          >
            <Copy className="h-4 w-4 mr-1" />
            Duplicar
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="flex-1"
            onClick={() => onDeleteNode(selectedNode.id)}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Excluir
          </Button>
        </div>
      )}
    </div>
  );
};
