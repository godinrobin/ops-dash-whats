import { Handle, Position, NodeProps } from '@xyflow/react';
import { Play } from 'lucide-react';
import { NodeAnalyticsWrapper } from '../NodeAnalyticsWrapper';

export const StartNode = ({ id }: NodeProps) => {
  return (
    <NodeAnalyticsWrapper nodeId={id}>
      <div className="bg-green-500 text-white rounded-full p-4 shadow-lg border-2 border-green-600">
        <div className="flex items-center gap-2">
          <Play className="h-5 w-5" />
          <span className="font-medium">Início</span>
        </div>
        <Handle
          type="source"
          position={Position.Bottom}
          className="!bg-green-600 !w-3 !h-3"
        />
      </div>
    </NodeAnalyticsWrapper>
  );
};
