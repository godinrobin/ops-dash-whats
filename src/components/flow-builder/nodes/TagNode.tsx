import { Handle, Position, NodeProps } from '@xyflow/react';
import { Tag } from 'lucide-react';

export const TagNode = ({ data }: NodeProps) => {
  const nodeData = data as { tagName?: string; action?: string };

  return (
    <div className="bg-card border-2 border-amber-500 rounded-lg p-3 shadow-md min-w-[180px]">
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-amber-500 !w-3 !h-3"
      />
      <div className="flex items-center gap-2 mb-2">
        <div className="p-1.5 rounded bg-amber-500">
          <Tag className="h-3.5 w-3.5 text-white" />
        </div>
        <span className="font-medium text-sm">Tag</span>
      </div>
      <div className="text-xs text-muted-foreground truncate max-w-[160px]">
        {nodeData.tagName 
          ? `${nodeData.action === 'remove' ? '−' : '+'} ${nodeData.tagName}`
          : 'Configure a tag...'}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-amber-500 !w-3 !h-3"
      />
    </div>
  );
};
