import { Handle, Position, NodeProps } from '@xyflow/react';
import { Clock } from 'lucide-react';

export const DelayNode = ({ data }: NodeProps) => {
  const nodeData = data as { delay?: number; unit?: string };
  const delay = nodeData.delay || 5;
  const unit = nodeData.unit || 'seconds';
  
  const unitLabel = unit === 'seconds' ? 's' : unit === 'minutes' ? 'min' : 'h';

  return (
    <div className="bg-card border-2 border-yellow-500 rounded-lg p-3 shadow-md min-w-[180px]">
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-yellow-500 !w-3 !h-3"
      />
      <div className="flex items-center gap-2 mb-2">
        <div className="p-1.5 rounded bg-yellow-500">
          <Clock className="h-3.5 w-3.5 text-white" />
        </div>
        <span className="font-medium text-sm">Delay</span>
      </div>
      <div className="text-xs text-muted-foreground">
        Aguardar {delay}{unitLabel}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-yellow-500 !w-3 !h-3"
      />
    </div>
  );
};
