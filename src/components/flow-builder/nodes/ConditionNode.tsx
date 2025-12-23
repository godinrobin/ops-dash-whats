import { Handle, Position, NodeProps } from '@xyflow/react';
import { GitBranch, Tag, Variable } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface ConditionRule {
  id: string;
  type: 'variable' | 'tag';
  variable?: string;
  operator?: string;
  value?: string;
  tagName?: string;
  tagCondition?: 'has' | 'not_has';
}

interface ConditionNodeData {
  conditions?: ConditionRule[];
  logicOperator?: 'and' | 'or';
  // Legacy support
  variable?: string;
  operator?: string;
  value?: string;
}

const operatorLabels: Record<string, string> = {
  equals: 'Igual a',
  not_equals: 'Diferente de',
  contains: 'Contém',
  not_contains: 'Não contém',
  startsWith: 'Começa com',
  endsWith: 'Termina com',
  greater: 'Maior que',
  less: 'Menor que',
  exists: 'Existe',
  not_exists: 'Não existe',
};

export const ConditionNode = ({ data }: NodeProps) => {
  const nodeData = data as ConditionNodeData;
  const conditions = nodeData.conditions || [];
  const logicOperator = nodeData.logicOperator || 'and';

  // Legacy support - if no conditions array but has old format
  const hasLegacyCondition = !conditions.length && nodeData.variable;

  const getOperatorLabel = (operator: string | undefined) => {
    if (!operator) return '?';
    return operatorLabels[operator] || operator;
  };

  const getConditionSummary = () => {
    if (hasLegacyCondition) {
      return `${nodeData.variable} ${getOperatorLabel(nodeData.operator)} ${nodeData.value || '?'}`;
    }

    if (conditions.length === 0) {
      return 'Configure as condições...';
    }

    if (conditions.length === 1) {
      const c = conditions[0];
      if (c.type === 'tag') {
        return `Tag: ${c.tagCondition === 'has' ? 'Tem' : 'Não tem'} "${c.tagName || '?'}"`;
      }
      return `${c.variable || '?'} ${getOperatorLabel(c.operator)} ${c.value || '?'}`;
    }

    return `${conditions.length} condições (${logicOperator === 'and' ? 'E' : 'OU'})`;
  };

  const getConditionIcons = () => {
    const hasVariableCondition = conditions.some(c => c.type === 'variable') || hasLegacyCondition;
    const hasTagCondition = conditions.some(c => c.type === 'tag');
    
    return (
      <div className="flex gap-1 mt-1">
        {hasVariableCondition && (
          <Badge variant="outline" className="text-xs px-1 py-0">
            <Variable className="h-2.5 w-2.5 mr-0.5" />
            Var
          </Badge>
        )}
        {hasTagCondition && (
          <Badge variant="outline" className="text-xs px-1 py-0">
            <Tag className="h-2.5 w-2.5 mr-0.5" />
            Tag
          </Badge>
        )}
      </div>
    );
  };

  return (
    <div className="bg-card border-2 border-red-500 rounded-lg p-3 shadow-md min-w-[200px]">
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-red-500 !w-3 !h-3"
      />
      <div className="flex items-center gap-2 mb-2">
        <div className="p-1.5 rounded bg-red-500">
          <GitBranch className="h-3.5 w-3.5 text-white" />
        </div>
        <span className="font-medium text-sm">Condição</span>
        {conditions.length > 1 && (
          <Badge variant="secondary" className="text-xs">
            {logicOperator === 'and' ? 'E' : 'OU'}
          </Badge>
        )}
      </div>
      <div className="text-xs text-muted-foreground truncate max-w-[180px]">
        {getConditionSummary()}
      </div>
      {getConditionIcons()}
      <div className="flex justify-between mt-2 text-xs">
        <span className="text-green-500">✓ Sim</span>
        <span className="text-red-500">✗ Não</span>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        id="yes"
        className="!bg-green-500 !w-3 !h-3 !left-[30%]"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="no"
        className="!bg-red-500 !w-3 !h-3 !left-[70%]"
      />
    </div>
  );
};
