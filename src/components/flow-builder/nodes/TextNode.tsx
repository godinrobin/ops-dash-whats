import { Handle, Position, NodeProps } from '@xyflow/react';
import { MessageSquare, Keyboard } from 'lucide-react';

export const TextNode = ({ data }: NodeProps) => {
  const nodeData = data as { message?: string; showPresence?: boolean; presenceDelay?: number };
  
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
        {nodeData.showPresence && (
          <div className="flex items-center gap-1 ml-auto" title={`Digitando por ${nodeData.presenceDelay || 3}s`}>
            <Keyboard className="h-3 w-3 text-blue-500" />
          </div>
        )}
      </div>
      <div className="text-xs text-muted-foreground truncate max-w-[160px]">
        {nodeData.message || 'Configure a mensagem...'}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-blue-500 !w-3 !h-3"
      />
    </div>
  );
};
