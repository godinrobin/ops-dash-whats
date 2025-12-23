import { Handle, Position, NodeProps } from '@xyflow/react';
import { GitBranch, Tag, Variable, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

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
  // Validation
  undefinedVariables?: string[];
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
  const undefinedVariables = nodeData.undefinedVariables || [];
  const hasWarning = undefinedVariables.length > 0;

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

  const warningContent = (
    <div className="text-sm">
      <p className="font-medium mb-1">Variáveis não definidas:</p>
      <ul className="list-disc list-inside">
        {undefinedVariables.map((v, i) => (
          <li key={i} className="text-yellow-200">{v}</li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">
        Adicione um nó "Definir Variável" ou "Aguardar Resposta" antes desta condição.
      </p>
    </div>
  );

  return (
    <TooltipProvider>
      <div 
        className={cn(
          "bg-card border-2 rounded-lg p-3 shadow-md min-w-[200px] transition-all",
          hasWarning 
            ? "border-yellow-500 shadow-yellow-500/20" 
            : "border-red-500"
        )}
      >
        <Handle
          type="target"
          position={Position.Top}
          className="!bg-red-500 !w-3 !h-3"
        />
        <div className="flex items-center gap-2 mb-2">
          <div className={cn(
            "p-1.5 rounded",
            hasWarning ? "bg-yellow-500" : "bg-red-500"
          )}>
            <GitBranch className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="font-medium text-sm">Condição</span>
          {conditions.length > 1 && (
            <Badge variant="secondary" className="text-xs">
              {logicOperator === 'and' ? 'E' : 'OU'}
            </Badge>
          )}
          {hasWarning && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="ml-auto cursor-help">
                  <AlertTriangle className="h-4 w-4 text-yellow-500 animate-pulse" />
                </div>
              </TooltipTrigger>
              <TooltipContent 
                side="top" 
                className="bg-yellow-950 border-yellow-700 max-w-xs"
              >
                {warningContent}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        <div className={cn(
          "text-xs truncate max-w-[180px]",
          hasWarning ? "text-yellow-500" : "text-muted-foreground"
        )}>
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
    </TooltipProvider>
  );
};
