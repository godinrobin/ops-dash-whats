import { Handle, Position, NodeProps } from '@xyflow/react';
import { CircleStop } from 'lucide-react';
import { NodeAnalyticsWrapper } from '../NodeAnalyticsWrapper';

export const EndNode = ({ id }: NodeProps) => {
  return (
    <NodeAnalyticsWrapper nodeId={id}>
      <div className="bg-gray-500 text-white rounded-full p-4 shadow-lg border-2 border-gray-600">
        <Handle
          type="target"
          position={Position.Top}
          className="!bg-gray-600 !w-3 !h-3"
        />
        <div className="flex items-center gap-2">
          <CircleStop className="h-5 w-5" />
          <span className="font-medium">Fim</span>
        </div>
      </div>
    </NodeAnalyticsWrapper>
  );
};
