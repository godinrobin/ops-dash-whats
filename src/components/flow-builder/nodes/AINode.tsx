import { Handle, Position, NodeProps } from '@xyflow/react';
import { Bot } from 'lucide-react';
import { NodeAnalyticsWrapper } from '../NodeAnalyticsWrapper';

export const AINode = ({ id, data }: NodeProps) => {
  const nodeData = data as { model?: string };

  return (
    <NodeAnalyticsWrapper nodeId={id}>
      <div className="bg-card border-2 border-violet-500 rounded-lg p-3 shadow-md min-w-[180px]">
        <Handle
          type="target"
          position={Position.Top}
          className="!bg-violet-500 !w-3 !h-3"
        />
        <div className="flex items-center gap-2 mb-2">
          <div className="p-1.5 rounded bg-violet-500">
            <Bot className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="font-medium text-sm">Resposta IA</span>
        </div>
        <div className="text-xs text-muted-foreground">
          {nodeData.model || 'gpt-4o-mini'}
        </div>
        <Handle
          type="source"
          position={Position.Bottom}
          className="!bg-violet-500 !w-3 !h-3"
        />
      </div>
    </NodeAnalyticsWrapper>
  );
};
