import { Handle, Position, NodeProps } from '@xyflow/react';
import { Shuffle } from 'lucide-react';
import { NodeAnalyticsWrapper } from '../NodeAnalyticsWrapper';

interface Split {
  id: string;
  name: string;
  percentage: number;
}

interface RandomizerNodeData {
  label?: string;
  splits?: Split[];
}

export const RandomizerNode = ({ id, data, selected }: NodeProps & { selected?: boolean }) => {
  const nodeData = data as RandomizerNodeData;
  const splits: Split[] = nodeData.splits || [
    { id: 'A', name: 'A', percentage: 50 },
    { id: 'B', name: 'B', percentage: 50 },
  ];

  return (
    <NodeAnalyticsWrapper nodeId={id}>
    <div className={`px-4 py-3 rounded-lg border-2 min-w-[180px] ${
      selected ? 'border-violet-500 shadow-lg shadow-violet-500/20' : 'border-border'
    } bg-card`}>
      <Handle type="target" position={Position.Top} className="!bg-violet-500 !w-3 !h-3" />
      
      <div className="flex items-center gap-2 mb-2">
        <div className="p-1.5 rounded bg-violet-500">
          <Shuffle className="h-3.5 w-3.5 text-white" />
        </div>
        <span className="text-sm font-medium">Randomizador</span>
      </div>

      <div className="space-y-1.5">
        {splits.map((split, index) => (
          <div key={split.id} className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Split {split.name}</span>
            <span className="font-medium text-violet-500">{split.percentage}%</span>
          </div>
        ))}
      </div>

      {/* Dynamic output handles for each split */}
      <div className="relative mt-2 pt-2 border-t border-border">
        <div className="flex justify-around">
          {splits.map((split, index) => (
            <div key={split.id} className="flex flex-col items-center">
              <span className="text-xs text-muted-foreground mb-1">{split.name}</span>
              <Handle
                type="source"
                position={Position.Bottom}
                id={`split-${split.id}`}
                className="!bg-violet-500 !w-2.5 !h-2.5 !relative !transform-none !left-0 !bottom-0"
                style={{ position: 'relative' }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
    </NodeAnalyticsWrapper>
  );
};
