import { Handle, Position, NodeProps } from '@xyflow/react';
import { MessageSquare } from 'lucide-react';

export const TextNode = ({ data }: NodeProps) => {
  return (
    <div className="bg-card border-2 border-blue-500 rounded-lg p-3 shadow-md min-w-[180px]">
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-blue-500 !w-3 !h-3"
      />
      <div className="flex items-center gap-2 mb-2">
        <div className="p-1.5 rounded bg-blue-500">
          <MessageSquare className="h-3.5 w-3.5 text-white" />
        </div>
        <span className="font-medium text-sm">Texto</span>
      </div>
      <div className="text-xs text-muted-foreground truncate max-w-[160px]">
        {(data as { message?: string })?.message || 'Configure a mensagem...'}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-blue-500 !w-3 !h-3"
      />
    </div>
  );
};
