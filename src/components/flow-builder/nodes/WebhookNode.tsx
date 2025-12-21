import { Handle, Position, NodeProps } from '@xyflow/react';
import { Webhook } from 'lucide-react';

export const WebhookNode = ({ data }: NodeProps) => {
  const nodeData = data as { url?: string; method?: string };

  return (
    <div className="bg-card border-2 border-slate-500 rounded-lg p-3 shadow-md min-w-[180px]">
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-slate-500 !w-3 !h-3"
      />
      <div className="flex items-center gap-2 mb-2">
        <div className="p-1.5 rounded bg-slate-500">
          <Webhook className="h-3.5 w-3.5 text-white" />
        </div>
        <span className="font-medium text-sm">Webhook</span>
      </div>
      <div className="text-xs text-muted-foreground truncate max-w-[160px]">
        {nodeData.url 
          ? `${nodeData.method || 'POST'} ${nodeData.url}`
          : 'Configure a URL...'}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-slate-500 !w-3 !h-3"
      />
    </div>
  );
};
