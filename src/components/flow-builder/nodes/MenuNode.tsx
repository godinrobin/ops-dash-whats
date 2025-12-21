import { Handle, Position, NodeProps } from '@xyflow/react';
import { List } from 'lucide-react';

export const MenuNode = ({ data }: NodeProps) => {
  const nodeData = data as { options?: string };
  const optionCount = nodeData.options?.split('\n').filter(Boolean).length || 0;

  return (
    <div className="bg-card border-2 border-indigo-500 rounded-lg p-3 shadow-md min-w-[180px]">
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-indigo-500 !w-3 !h-3"
      />
      <div className="flex items-center gap-2 mb-2">
        <div className="p-1.5 rounded bg-indigo-500">
          <List className="h-3.5 w-3.5 text-white" />
        </div>
        <span className="font-medium text-sm">Menu</span>
      </div>
      <div className="text-xs text-muted-foreground">
        {optionCount > 0 ? `${optionCount} opções` : 'Configure as opções...'}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-indigo-500 !w-3 !h-3"
      />
    </div>
  );
};
