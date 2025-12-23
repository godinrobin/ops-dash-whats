import { useState, useEffect, useCallback } from 'react';
import { Node } from '@xyflow/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, Save, Settings } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ConditionEditor } from './ConditionEditor';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface PropertiesPanelProps {
  selectedNode: Node | null;
  onUpdateNode: (nodeId: string, data: Record<string, unknown>) => void;
  onDeleteNode: (nodeId: string) => void;
  onSave: () => void;
  triggerType?: 'keyword' | 'all' | 'schedule';
  triggerKeywords?: string[];
  onUpdateFlowSettings?: (settings: { triggerType?: string; triggerKeywords?: string[] }) => void;
  allNodes?: Node[];
}

// System variables that are always available (synchronized with backend)
const SYSTEM_VARIABLES = ['nome', 'telefone', 'resposta', 'lastMessage', 'contactName', 'ultima_mensagem'];

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
        // Get available variables from other nodes
        const getAvailableVariablesForText = () => {
          const variables: string[] = ['nome', 'telefone'];
          // This would need access to all nodes - for now we show common ones
          return variables;
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
                      
                      const { supabase } = await import('@/integrations/supabase/client');
                      const { data: { user } } = await supabase.auth.getUser();
                      if (!user) {
                        const { toast } = await import('sonner');
                        toast.error('Você precisa estar logado');
                        return;
                      }
                      
                      const { toast } = await import('sonner');
                      toast.loading('Enviando arquivo...');
                      
                      const fileName = `${user.id}/flow-media/${Date.now()}-${file.name}`;
                      const { error } = await supabase.storage.from('video-clips').upload(fileName, file);
                      
                      if (error) {
                        toast.dismiss();
                        toast.error('Erro ao enviar arquivo');
                        console.error('Upload error:', error);
                        return;
                      }
                      
                      const { data: urlData } = supabase.storage.from('video-clips').getPublicUrl(fileName);
                      onUpdateNode(selectedNode.id, { 
                        mediaUrl: urlData.publicUrl,
                        fileName: file.name 
                      });
                      toast.dismiss();
                      toast.success('Arquivo enviado!');
                    }}
                    className="cursor-pointer"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    Clique para selecionar um arquivo
                  </p>
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
                    onChange={(e) => onUpdateNode(selectedNode.id, { delay: parseInt(e.target.value) })}
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
                      onChange={(e) => onUpdateNode(selectedNode.id, { minDelay: parseInt(e.target.value) })}
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
                      onChange={(e) => onUpdateNode(selectedNode.id, { maxDelay: parseInt(e.target.value) })}
                    />
                    <span className="flex items-center text-sm text-muted-foreground w-28 pl-3">
                      {(nodeData.unit as string) === 'minutes' ? 'Minutos' : 
                       (nodeData.unit as string) === 'hours' ? 'Horas' : 'Segundos'}
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
            <div className="space-y-2">
              <Label>Prazo para responder (segundos)</Label>
              <Input
                type="number"
                min={30}
                value={(nodeData.timeout as number) || 300}
                onChange={(e) => onUpdateNode(selectedNode.id, { timeout: parseInt(e.target.value) })}
              />
              <p className="text-xs text-muted-foreground">
                O fluxo continuará automaticamente após este prazo, mesmo sem resposta.
              </p>
            </div>
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
        <Button
          variant="destructive"
          size="sm"
          className="mt-4"
          onClick={() => onDeleteNode(selectedNode.id)}
        >
          <Trash2 className="h-4 w-4 mr-1" />
          Excluir Nó
        </Button>
      )}
    </div>
  );
};
