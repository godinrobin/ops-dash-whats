import { Handle, Position, NodeProps } from '@xyflow/react';
import { Clock } from 'lucide-react';
import { NodeAnalyticsWrapper } from '../NodeAnalyticsWrapper';

interface DelayNodeData {
  delay?: number;
  unit?: string;
  delayType?: 'fixed' | 'variable';
  minDelay?: number;
  maxDelay?: number;
}

export const DelayNode = ({ id, data }: NodeProps) => {
  const nodeData = data as DelayNodeData;
  const delayType = nodeData.delayType || 'fixed';
  const delay = nodeData.delay || 5;
  const minDelay = nodeData.minDelay || 5;
  const maxDelay = nodeData.maxDelay || 15;
  const unit = nodeData.unit || 'seconds';
  
  const unitLabel = unit === 'seconds' ? 's' : unit === 'minutes' ? 'min' : unit === 'hours' ? 'h' : 'd';

  const getDelayText = () => {
    if (delayType === 'variable') {
      return `${minDelay} a ${maxDelay}${unitLabel}`;
    }
    return `${delay}${unitLabel}`;
  };

  return (
    <NodeAnalyticsWrapper nodeId={id}>
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
          {delayType === 'variable' && (
            <span className="text-[10px] bg-yellow-500/20 text-yellow-600 px-1.5 py-0.5 rounded">Variável</span>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          Aguardar {getDelayText()}
        </div>
        <Handle
          type="source"
          position={Position.Bottom}
          className="!bg-yellow-500 !w-3 !h-3"
        />
      </div>
    </NodeAnalyticsWrapper>
  );
};
