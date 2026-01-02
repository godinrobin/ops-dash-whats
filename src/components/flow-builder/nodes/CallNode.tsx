import { Handle, Position, NodeProps } from '@xyflow/react';
import { Phone } from 'lucide-react';
import { NodeAnalyticsWrapper } from '../NodeAnalyticsWrapper';

export const CallNode = ({ id, data }: NodeProps) => {
  const nodeData = data as { duration?: number };

  return (
    <NodeAnalyticsWrapper nodeId={id}>
      <div className="bg-card border-2 border-sky-500 rounded-lg p-3 shadow-md min-w-[180px]">
        <Handle
          type="target"
          position={Position.Top}
          className="!bg-sky-500 !w-3 !h-3"
        />
        <div className="flex items-center gap-2 mb-2">
          <div className="p-1.5 rounded bg-sky-500">
            <Phone className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="font-medium text-sm">Ligar</span>
        </div>
        <div className="text-xs text-muted-foreground">
          {nodeData.duration ? `${nodeData.duration}s` : 'Ligação breve'}
        </div>
        <Handle
          type="source"
          position={Position.Bottom}
          className="!bg-sky-500 !w-3 !h-3"
        />
      </div>
    </NodeAnalyticsWrapper>
  );
};
