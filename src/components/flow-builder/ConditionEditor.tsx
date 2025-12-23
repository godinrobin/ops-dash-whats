import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Plus, Trash2, Variable, Tag } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface ConditionRule {
  id: string;
  type: 'variable' | 'tag';
  variable?: string;
  operator?: string;
  value?: string;
  tagName?: string;
  tagCondition?: 'has' | 'not_has';
}

interface ConditionEditorProps {
  conditions: ConditionRule[];
  logicOperator: 'and' | 'or';
  customVariables: string[];
  onUpdateConditions: (conditions: ConditionRule[]) => void;
  onUpdateLogicOperator: (operator: 'and' | 'or') => void;
  onAddCustomVariable: (name: string) => void;
}

const SYSTEM_VARIABLES = ['nome', 'telefone', 'resposta', 'lastMessage', 'contactName'];

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

  const allVariables = [...SYSTEM_VARIABLES, ...customVariables];

  // Fetch existing tags from database
  useEffect(() => {
    const fetchTags = async () => {
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
      
      const tagSet = new Set<string>();
      
      // Add tags from inbox_tags table
      tagsData?.forEach(t => tagSet.add(t.name));
      
      // Add tags from contacts
      contactsData?.forEach(c => {
        const contactTags = c.tags as string[] | null;
        contactTags?.forEach(t => tagSet.add(t));
      });
      
      setExistingTags(Array.from(tagSet).sort());
    };
    
    fetchTags();
  }, [user]);

  const generateId = () => Math.random().toString(36).substring(2, 9);

  const addCondition = (type: 'variable' | 'tag') => {
    const newCondition: ConditionRule = {
      id: generateId(),
      type,
      ...(type === 'variable' ? { variable: '', operator: 'equals', value: '' } : { tagName: '', tagCondition: 'has' as const }),
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

  const handleAddVariable = () => {
    if (newVariableName.trim() && !allVariables.includes(newVariableName.trim())) {
      onAddCustomVariable(newVariableName.trim());
      if (editingConditionId) {
        updateCondition(editingConditionId, { variable: newVariableName.trim() });
      }
      setNewVariableName('');
      setShowNewVariableInput(false);
      setEditingConditionId(null);
    }
  };

  const handleAddTag = () => {
    if (newTagName.trim()) {
      if (editingTagConditionId) {
        updateCondition(editingTagConditionId, { tagName: newTagName.trim() });
      }
      // Add to existing tags list if not already present
      if (!existingTags.includes(newTagName.trim())) {
        setExistingTags(prev => [...prev, newTagName.trim()].sort());
      }
      setNewTagName('');
      setShowNewTagInput(false);
      setEditingTagConditionId(null);
    }
  };

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
                ) : (
                  <Badge variant="outline" className="text-xs">
                    <Tag className="h-3 w-3 mr-1" />
                    Tag
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
                        </SelectItem>
                      ))}
                      <SelectItem value="__new__" className="text-primary text-xs">
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
            ) : (
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
                      {existingTags.map((tag) => (
                        <SelectItem key={tag} value={tag} className="text-xs">
                          {tag}
                        </SelectItem>
                      ))}
                      <SelectItem value="__new__" className="text-primary text-xs">
                        + Nova tag
                      </SelectItem>
                    </SelectContent>
                  </Select>
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
      <div className="flex gap-2">
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
      </div>

      {conditions.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-2">
          Adicione condições para verificar variáveis ou tags do contato
        </p>
      )}
    </div>
  );
};
