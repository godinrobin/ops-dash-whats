import { Handle, Position, NodeProps } from '@xyflow/react';
import { MessageCircle } from 'lucide-react';
import { NodeAnalyticsWrapper } from '../NodeAnalyticsWrapper';

export const WaitInputNode = ({ id, data }: NodeProps) => {
  const nodeData = data as { variableName?: string };

  return (
    <NodeAnalyticsWrapper nodeId={id}>
      <div className="bg-card border-2 border-cyan-500 rounded-lg p-3 shadow-md min-w-[180px]">
        <Handle
          type="target"
          position={Position.Top}
          className="!bg-cyan-500 !w-3 !h-3"
        />
        <div className="flex items-center gap-2 mb-2">
          <div className="p-1.5 rounded bg-cyan-500">
            <MessageCircle className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="font-medium text-sm">Aguardar Resposta</span>
        </div>
        <div className="text-xs text-muted-foreground truncate max-w-[160px]">
          {nodeData.variableName ? `→ ${nodeData.variableName}` : 'Configure a variável...'}
        </div>
        <Handle
          type="source"
          position={Position.Bottom}
          className="!bg-cyan-500 !w-3 !h-3"
        />
      </div>
    </NodeAnalyticsWrapper>
  );
};
