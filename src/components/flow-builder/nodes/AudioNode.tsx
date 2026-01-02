import { Handle, Position, NodeProps } from '@xyflow/react';
import { Mic, Radio } from 'lucide-react';
import { NodeAnalyticsWrapper } from '../NodeAnalyticsWrapper';

export const AudioNode = ({ id, data }: NodeProps) => {
  const nodeData = data as { mediaUrl?: string; showPresence?: boolean; presenceDelay?: number };
  const hasMedia = !!nodeData.mediaUrl;

  return (
    <NodeAnalyticsWrapper nodeId={id}>
      <div className="bg-card border-2 border-orange-500 rounded-lg p-3 shadow-md min-w-[180px]">
        <Handle
          type="target"
          position={Position.Top}
          className="!bg-orange-500 !w-3 !h-3"
        />
        <div className="flex items-center gap-2 mb-2">
          <div className="p-1.5 rounded bg-orange-500">
            <Mic className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="font-medium text-sm">Áudio</span>
          {nodeData.showPresence && (
            <div className="flex items-center gap-1 ml-auto" title={`Gravando por ${nodeData.presenceDelay || 3}s`}>
              <Radio className="h-3 w-3 text-orange-500" />
            </div>
          )}
        </div>
        {hasMedia ? (
          <div className="w-full">
            <audio 
              src={nodeData.mediaUrl} 
              controls 
              className="w-full h-8"
              style={{ maxWidth: '160px' }}
            />
          </div>
        ) : (
          <div className="text-xs text-muted-foreground truncate max-w-[160px]">
            Clique para configurar...
          </div>
        )}
        <Handle
          type="source"
          position={Position.Bottom}
          className="!bg-orange-500 !w-3 !h-3"
        />
      </div>
    </NodeAnalyticsWrapper>
  );
};
