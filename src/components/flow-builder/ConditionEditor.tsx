import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Plus, Trash2, Variable, Tag } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface ConditionRule {
  id: string;
  type: 'variable' | 'tag' | 'ia';
  variable?: string;
  operator?: string;
  value?: string;
  tagName?: string;
  tagCondition?: 'has' | 'not_has';
  iaPrompt?: string;
}

interface ConditionEditorProps {
  conditions: ConditionRule[];
  logicOperator: 'and' | 'or';
  customVariables: string[];
  onUpdateConditions: (conditions: ConditionRule[]) => void;
  onUpdateLogicOperator: (operator: 'and' | 'or') => void;
  onAddCustomVariable: (name: string) => void;
}

// System variables (synchronized with backend webhook-inbox-messages)
const SYSTEM_VARIABLES = ['nome', 'telefone', 'resposta', 'lastMessage', 'contactName', 'ultima_mensagem'];

export const ConditionEditor = ({
  conditions,
  logicOperator,
  customVariables,
  onUpdateConditions,
  onUpdateLogicOperator,
  onAddCustomVariable,
}: ConditionEditorProps) => {
  const { user } = useAuth();
  const [showNewVariableInput, setShowNewVariableInput] = useState(false);
  const [newVariableName, setNewVariableName] = useState('');
  const [editingConditionId, setEditingConditionId] = useState<string | null>(null);
  const [showNewTagInput, setShowNewTagInput] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [editingTagConditionId, setEditingTagConditionId] = useState<string | null>(null);
  const [existingTags, setExistingTags] = useState<string[]>([]);
  const [dbCustomVariables, setDbCustomVariables] = useState<string[]>([]);

  // Combined variables: system + from database + from flow nodes
  const allVariables = [...new Set([...SYSTEM_VARIABLES, ...dbCustomVariables, ...customVariables])];

  // Fetch existing tags and custom variables from database
  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      
      // Fetch from inbox_tags table
      const { data: tagsData } = await supabase
        .from('inbox_tags')
        .select('name')
        .eq('user_id', user.id);
      
      // Also fetch unique tags from contacts
      const { data: contactsData } = await supabase
        .from('inbox_contacts')
        .select('tags')
        .eq('user_id', user.id);
      
      // Fetch custom variables from database
      const { data: variablesData } = await supabase
        .from('inbox_custom_variables')
        .select('name')
        .eq('user_id', user.id);
      
      const tagSet = new Set<string>();
      
      // Add tags from inbox_tags table
      tagsData?.forEach(t => tagSet.add(t.name));
      
      // Add tags from contacts
      contactsData?.forEach(c => {
        const contactTags = c.tags as string[] | null;
        contactTags?.forEach(t => tagSet.add(t));
      });
      
      // IMPORTANT: Also include tags that are already used in conditions
      // This ensures that tags saved in the flow appear in the dropdown even if not in DB
      conditions.forEach(c => {
        if (c.type === 'tag' && c.tagName && c.tagName.trim()) {
          tagSet.add(c.tagName.trim());
        }
      });
      
      setExistingTags(Array.from(tagSet).sort());
      setDbCustomVariables(variablesData?.map(v => v.name) || []);
    };
    
    fetchData();
  }, [user, conditions]);

  const generateId = () => Math.random().toString(36).substring(2, 9);

  const addCondition = (type: 'variable' | 'tag' | 'ia') => {
    const newCondition: ConditionRule = {
      id: generateId(),
      type,
      ...(type === 'variable' 
        ? { variable: '', operator: 'equals', value: '' } 
        : type === 'tag'
        ? { tagName: '', tagCondition: 'has' as const }
        : { iaPrompt: '' }),
    };
    onUpdateConditions([...conditions, newCondition]);
  };

  const updateCondition = (id: string, updates: Partial<ConditionRule>) => {
    onUpdateConditions(
      conditions.map((c) => (c.id === id ? { ...c, ...updates } : c))
    );
  };

  const removeCondition = (id: string) => {
    onUpdateConditions(conditions.filter((c) => c.id !== id));
  };

  // Save custom variable to database
  const saveVariableToDb = async (name: string) => {
    if (!user || !name.trim()) return;
    
    try {
      const { error } = await supabase
        .from('inbox_custom_variables')
        .upsert(
          { user_id: user.id, name: name.trim() },
          { onConflict: 'user_id,name' }
        );
      
      if (error) {
        console.error('Error saving variable:', error);
        return;
      }
      
      // Update local state
      if (!dbCustomVariables.includes(name.trim())) {
        setDbCustomVariables(prev => [...prev, name.trim()].sort());
      }
    } catch (error) {
      console.error('Error saving variable:', error);
    }
  };

  // Delete custom variable from database
  const deleteVariableFromDb = async (name: string) => {
    if (!user || !name.trim()) return;
    
    try {
      const { error } = await supabase
        .from('inbox_custom_variables')
        .delete()
        .eq('user_id', user.id)
        .eq('name', name.trim());
      
      if (error) {
        console.error('Error deleting variable:', error);
        toast.error('Erro ao deletar variável');
        return;
      }
      
      // Update local state
      setDbCustomVariables(prev => prev.filter(v => v !== name.trim()));
      toast.success(`Variável "${name}" deletada com sucesso`);
    } catch (error) {
      console.error('Error deleting variable:', error);
      toast.error('Erro ao deletar variável');
    }
  };

  // Save tag to database
  const saveTagToDb = async (name: string): Promise<boolean> => {
    if (!user || !name.trim()) return false;
    
    const trimmedName = name.trim();
    
    try {
      // First, check if tag already exists
      const { data: existingTag } = await supabase
        .from('inbox_tags')
        .select('id')
        .eq('user_id', user.id)
        .eq('name', trimmedName)
        .maybeSingle();
      
      if (existingTag) {
        // Tag already exists, just update local state
        if (!existingTags.includes(trimmedName)) {
          setExistingTags(prev => [...prev, trimmedName].sort());
        }
        return true;
      }
      
      // Insert new tag
      const { error } = await supabase
        .from('inbox_tags')
        .insert({ user_id: user.id, name: trimmedName });
      
      if (error) {
        console.error('Error saving tag:', error);
        toast.error('Erro ao salvar tag no banco de dados');
        return false;
      }
      
      // Update local state
      if (!existingTags.includes(trimmedName)) {
        setExistingTags(prev => [...prev, trimmedName].sort());
      }
      return true;
    } catch (error) {
      console.error('Error saving tag:', error);
      toast.error('Erro ao salvar tag');
      return false;
    }
  };

  const handleAddVariable = async () => {
    if (newVariableName.trim() && !allVariables.includes(newVariableName.trim())) {
      // Save to database
      await saveVariableToDb(newVariableName.trim());
      
      // Notify parent
      onAddCustomVariable(newVariableName.trim());
      
      if (editingConditionId) {
        updateCondition(editingConditionId, { variable: newVariableName.trim() });
      }
      setNewVariableName('');
      setShowNewVariableInput(false);
      setEditingConditionId(null);
      
      toast.success(`Variável "${newVariableName.trim()}" criada com sucesso`);
    }
  };

  const handleAddTag = async () => {
    if (newTagName.trim()) {
      const trimmedName = newTagName.trim();
      
      // Save to database
      const saved = await saveTagToDb(trimmedName);
      
      if (saved && editingTagConditionId) {
        updateCondition(editingTagConditionId, { tagName: trimmedName });
        toast.success(`Tag "${trimmedName}" criada com sucesso`);
      }
      
      setNewTagName('');
      setShowNewTagInput(false);
      setEditingTagConditionId(null);
    }
  };

  // Check if a variable is a system variable (cannot be deleted)
  const isSystemVariable = (name: string) => SYSTEM_VARIABLES.includes(name);

  return (
    <div className="space-y-4">
      {/* Logic operator selector */}
      {conditions.length > 1 && (
        <div className="space-y-2">
          <Label>Combinar condições com</Label>
          <Select
            value={logicOperator}
            onValueChange={(value) => onUpdateLogicOperator(value as 'and' | 'or')}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="and">E (todas devem ser verdadeiras)</SelectItem>
              <SelectItem value="or">OU (pelo menos uma verdadeira)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Conditions list */}
      <div className="space-y-3">
        {conditions.map((condition, index) => (
          <Card key={condition.id} className="p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {condition.type === 'variable' ? (
                  <Badge variant="outline" className="text-xs">
                    <Variable className="h-3 w-3 mr-1" />
                    Variável
                  </Badge>
                ) : condition.type === 'tag' ? (
                  <Badge variant="outline" className="text-xs">
                    <Tag className="h-3 w-3 mr-1" />
                    Tag
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs bg-violet-500/10 border-violet-500/30 text-violet-400">
                    🤖 IA
                  </Badge>
                )}
                {index > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {logicOperator === 'and' ? 'E' : 'OU'}
                  </span>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                onClick={() => removeCondition(condition.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>

            {condition.type === 'variable' ? (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">Variável</Label>
                  <Select
                    value={condition.variable || ''}
                    onValueChange={(value) => {
                      if (value === '__new__') {
                        setShowNewVariableInput(true);
                        setEditingConditionId(condition.id);
                      } else {
                        updateCondition(condition.id, { variable: value });
                      }
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {allVariables.map((v) => (
                        <SelectItem key={v} value={v} className="text-xs">
                          {`{{${v}}}`}
                          {isSystemVariable(v) && (
                            <span className="ml-1 text-muted-foreground">(sistema)</span>
                          )}
                        </SelectItem>
                      ))}
                      <SelectItem value="__new__" className="text-orange-400 text-xs font-medium">
                        + Nova variável
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Operador</Label>
                    <Select
                      value={condition.operator || 'equals'}
                      onValueChange={(value) => updateCondition(condition.id, { operator: value })}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="equals" className="text-xs">Igual a</SelectItem>
                        <SelectItem value="not_equals" className="text-xs">Diferente de</SelectItem>
                        <SelectItem value="contains" className="text-xs">Contém</SelectItem>
                        <SelectItem value="not_contains" className="text-xs">Não contém</SelectItem>
                        <SelectItem value="startsWith" className="text-xs">Começa com</SelectItem>
                        <SelectItem value="endsWith" className="text-xs">Termina com</SelectItem>
                        <SelectItem value="greater" className="text-xs">Maior que</SelectItem>
                        <SelectItem value="less" className="text-xs">Menor que</SelectItem>
                        <SelectItem value="exists" className="text-xs">Existe (não vazio)</SelectItem>
                        <SelectItem value="not_exists" className="text-xs">Não existe (vazio)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {!['exists', 'not_exists'].includes(condition.operator || '') && (
                    <div className="space-y-1">
                      <Label className="text-xs">Valor</Label>
                      <Input
                        className="h-8 text-xs"
                        placeholder="Valor..."
                        value={condition.value || ''}
                        onChange={(e) => updateCondition(condition.id, { value: e.target.value })}
                      />
                    </div>
                  )}
                </div>
              </>
            ) : condition.type === 'tag' ? (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">Condição da Tag</Label>
                  <Select
                    value={condition.tagCondition || 'has'}
                    onValueChange={(value) => updateCondition(condition.id, { tagCondition: value as 'has' | 'not_has' })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="has" className="text-xs">Contato TEM a tag</SelectItem>
                      <SelectItem value="not_has" className="text-xs">Contato NÃO TEM a tag</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Nome da Tag</Label>
                  <Select
                    value={condition.tagName || ''}
                    onValueChange={(value) => {
                      if (value === '__new__') {
                        setShowNewTagInput(true);
                        setEditingTagConditionId(condition.id);
                      } else {
                        updateCondition(condition.id, { tagName: value });
                      }
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Selecione uma tag..." />
                    </SelectTrigger>
                    <SelectContent>
                      {existingTags.length === 0 && (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">
                          Nenhuma tag criada ainda
                        </div>
                      )}
                      {existingTags.map((tag) => (
                        <SelectItem key={tag} value={tag} className="text-xs">
                          {tag}
                        </SelectItem>
                      ))}
                      <SelectItem value="__new__" className="text-orange-400 text-xs font-medium">
                        + Nova tag
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : (
              <>
                <div className="bg-violet-500/10 border border-violet-500/20 rounded p-2 mb-2">
                  <p className="text-xs text-violet-300">
                    🤖 A IA irá analisar as tags, contexto da conversa, base de conhecimento e última mensagem para decidir Sim ou Não.
                  </p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-foreground">O que a IA deve verificar?</Label>
                  <Textarea
                    className="text-xs min-h-[80px] resize-y text-foreground"
                    placeholder="Ex: O cliente demonstrou interesse em comprar? A IA irá considerar a base de conhecimento configurada no fluxo."
                    value={condition.iaPrompt || ''}
                    onChange={(e) => updateCondition(condition.id, { iaPrompt: e.target.value })}
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    A IA considerará a base de conhecimento e responderá apenas Sim ou Não.
                  </p>
                </div>
              </>
            )}
          </Card>
        ))}
      </div>

      {/* New variable input */}
      {showNewVariableInput && (
        <div className="flex gap-2">
          <Input
            className="h-8 text-xs"
            placeholder="Nome da variável"
            value={newVariableName}
            onChange={(e) => setNewVariableName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddVariable();
              if (e.key === 'Escape') {
                setShowNewVariableInput(false);
                setEditingConditionId(null);
              }
            }}
            autoFocus
          />
          <Button size="sm" className="h-8 text-xs" onClick={handleAddVariable}>
            Criar
          </Button>
        </div>
      )}

      {/* New tag input */}
      {showNewTagInput && (
        <div className="flex gap-2">
          <Input
            className="h-8 text-xs"
            placeholder="Nome da tag"
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddTag();
              if (e.key === 'Escape') {
                setShowNewTagInput(false);
                setEditingTagConditionId(null);
              }
            }}
            autoFocus
          />
          <Button size="sm" className="h-8 text-xs" onClick={handleAddTag}>
            Criar
          </Button>
        </div>
      )}

      {/* Add condition buttons */}
      <div className="flex gap-2 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 h-8 text-xs"
          onClick={() => addCondition('variable')}
        >
          <Variable className="h-3 w-3 mr-1" />
          + Variável
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1 h-8 text-xs"
          onClick={() => addCondition('tag')}
        >
          <Tag className="h-3 w-3 mr-1" />
          + Tag
        </Button>
        {/* Only show IA condition button if no IA condition exists */}
        {!conditions.some(c => c.type === 'ia') && (
          <Button
            variant="outline"
            size="sm"
            className="w-full h-8 text-xs bg-primary/10 border-primary/30 text-primary hover:bg-primary/20"
            onClick={() => addCondition('ia')}
          >
            🤖 + Condição IA
          </Button>
        )}
      </div>

      {conditions.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-2">
          Adicione condições para verificar variáveis ou tags do contato
        </p>
      )}
    </div>
  );
};
