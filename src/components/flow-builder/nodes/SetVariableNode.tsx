import { Handle, Position, NodeProps } from '@xyflow/react';
import { Variable } from 'lucide-react';

export const SetVariableNode = ({ data }: NodeProps) => {
  const nodeData = data as { variableName?: string; value?: string };

  return (
    <div className="bg-card border-2 border-emerald-500 rounded-lg p-3 shadow-md min-w-[180px]">
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-emerald-500 !w-3 !h-3"
      />
      <div className="flex items-center gap-2 mb-2">
        <div className="p-1.5 rounded bg-emerald-500">
          <Variable className="h-3.5 w-3.5 text-white" />
        </div>
        <span className="font-medium text-sm">Variável</span>
      </div>
      <div className="text-xs text-muted-foreground truncate max-w-[160px]">
        {nodeData.variableName 
          ? `${nodeData.variableName} = ${nodeData.value || '?'}`
          : 'Configure a variável...'}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-emerald-500 !w-3 !h-3"
      />
    </div>
  );
};
