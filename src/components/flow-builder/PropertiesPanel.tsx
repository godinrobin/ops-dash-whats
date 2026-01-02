import { useState, useEffect, useCallback } from 'react';
import { Node } from '@xyflow/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  triggerType?: 'keyword' | 'all' | 'schedule';
  triggerKeywords?: string[];
  onUpdateFlowSettings?: (settings: { triggerType?: string; triggerKeywords?: string[] }) => void;
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
  onUpdateFlowSettings,
  allNodes = [],
}: PropertiesPanelProps) => {
  const { user } = useAuth();
  
  // State for condition variable management
  const [showNewVariableInput, setShowNewVariableInput] = useState(false);
  const [newVariableName, setNewVariableName] = useState('');
  const [dbCustomVariables, setDbCustomVariables] = useState<string[]>([]);
  
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
                </SelectContent>
              </Select>
            </div>

            {triggerType === 'keyword' && (
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
                  Separe por vírgula. O fluxo inicia quando a mensagem contiver uma dessas palavras.
                </p>
              </div>
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
            case 'video': return 'video/*';
            case 'document': return '.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.ppt,.pptx';
            default: return '*/*';
          }
        };
        
        // Video upload validation constants
        const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
        const ALLOWED_VIDEO_FORMATS = ['mp4', 'mov', 'avi', 'webm', 'mkv', 'quicktime'];
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
                    <p className="text-xs text-muted-foreground">
                      Formatos: {ALLOWED_VIDEO_FORMATS.join(', ')}
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
              </div>
            )}
            
            <div className="space-y-2">
              <Label>Legenda (opcional)</Label>
              <Input
                placeholder="Legenda..."
                value={(nodeData.caption as string) || ''}
                onChange={(e) => onUpdateNode(selectedNode.id, { caption: e.target.value })}
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

      case 'paymentIdentifier':
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

            <div className="space-y-2">
              <Label>Mensagem de erro (opcional)</Label>
              <Textarea
                placeholder="Por favor, envie o comprovante de pagamento..."
                value={(nodeData.errorMessage as string) || ''}
                onChange={(e) => onUpdateNode(selectedNode.id, { errorMessage: e.target.value })}
                rows={2}
              />
              <p className="text-xs text-muted-foreground">
                Enviada após cada tentativa inválida
              </p>
            </div>

            <div className="p-2 rounded bg-muted/50 text-xs">
              <strong>Saídas:</strong>
              <div className="flex gap-4 mt-1">
                <span className="text-emerald-500">✓ Pagou</span>
                <span className="text-red-500">✗ Não Pagou</span>
              </div>
            </div>
          </div>
        );

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
              <Label>Valor (R$)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
                value={(nodeData.amount as number) || ''}
                onChange={(e) => onUpdateNode(selectedNode.id, { amount: parseFloat(e.target.value) || 0 })}
              />
            </div>

            <div className="space-y-2">
              <Label>Nome do Item/Produto</Label>
              <Input
                placeholder="Ex: Produto XYZ"
                value={(nodeData.itemName as string) || ''}
                onChange={(e) => onUpdateNode(selectedNode.id, { itemName: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Descrição/Mensagem</Label>
              <Textarea
                placeholder="Descrição da cobrança..."
                value={(nodeData.description as string) || ''}
                onChange={(e) => onUpdateNode(selectedNode.id, { description: e.target.value })}
                rows={2}
              />
            </div>

            <div className="border-t pt-4 mt-4">
              <Label className="text-xs text-muted-foreground uppercase mb-3 block">Dados PIX para Recebimento</Label>
              
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
                <Label>Chave PIX</Label>
                <Input
                  placeholder="Sua chave PIX..."
                  value={(nodeData.pixKey as string) || ''}
                  onChange={(e) => onUpdateNode(selectedNode.id, { pixKey: e.target.value })}
                />
              </div>

              <div className="space-y-2 mt-2">
                <Label>Nome do Recebedor</Label>
                <Input
                  placeholder="Nome exibido para o cliente"
                  value={(nodeData.pixName as string) || ''}
                  onChange={(e) => onUpdateNode(selectedNode.id, { pixName: e.target.value })}
                />
              </div>
            </div>
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
        <div className="flex gap-2 mt-4">
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
