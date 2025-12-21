import { Handle, Position, NodeProps } from '@xyflow/react';
import { GitBranch } from 'lucide-react';

export const ConditionNode = ({ data }: NodeProps) => {
  const nodeData = data as { variable?: string; operator?: string; value?: string };

  return (
    <div className="bg-card border-2 border-red-500 rounded-lg p-3 shadow-md min-w-[180px]">
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
      </div>
      <div className="text-xs text-muted-foreground truncate max-w-[160px]">
        {nodeData.variable 
          ? `${nodeData.variable} ${nodeData.operator || '='} ${nodeData.value || '?'}`
          : 'Configure a condição...'}
      </div>
      <div className="flex justify-between mt-2 text-xs">
        <span className="text-green-500">Sim</span>
        <span className="text-red-500">Não</span>
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
