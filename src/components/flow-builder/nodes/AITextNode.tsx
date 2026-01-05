import { Handle, Position, NodeProps } from '@xyflow/react';
import { Sparkles, Keyboard } from 'lucide-react';
import { NodeAnalyticsWrapper } from '../NodeAnalyticsWrapper';

export const AITextNode = ({ id, data }: NodeProps) => {
  const nodeData = data as { message?: string; showPresence?: boolean; presenceDelay?: number };
  
  return (
    <NodeAnalyticsWrapper nodeId={id}>
      <div className="bg-card border-2 border-violet-500 rounded-lg p-3 shadow-md min-w-[180px]">
        <Handle
          type="target"
          position={Position.Top}
          className="!bg-violet-500 !w-3 !h-3"
        />
        <div className="flex items-center gap-2 mb-2">
          <div className="p-1.5 rounded bg-gradient-to-r from-violet-500 to-purple-500">
            <Sparkles className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="font-medium text-sm">Texto com IA</span>
          {nodeData.showPresence && (
            <div className="flex items-center gap-1 ml-auto" title={`Digitando por ${nodeData.presenceDelay || 3}s`}>
              <Keyboard className="h-3 w-3 text-violet-500" />
            </div>
          )}
        </div>
        <div className="text-xs text-muted-foreground truncate max-w-[160px]">
          {nodeData.message || 'Configure o texto base...'}
        </div>
        <div className="text-[10px] text-violet-500 mt-1">
          ✨ Variações automáticas por IA
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
