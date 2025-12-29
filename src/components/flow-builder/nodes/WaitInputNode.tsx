import { Handle, Position, NodeProps } from '@xyflow/react';
import { MessageCircle, Clock, Bell } from 'lucide-react';
import { NodeAnalyticsWrapper } from '../NodeAnalyticsWrapper';

export const WaitInputNode = ({ id, data }: NodeProps) => {
  const nodeData = data as { 
    variableName?: string;
    timeoutEnabled?: boolean;
    timeout?: number;
    timeoutUnit?: string;
    followUpEnabled?: boolean;
    followUpDelay?: number;
    followUpUnit?: string;
  };

  const formatTime = (value: number, unit: string) => {
    const labels: Record<string, string> = {
      seconds: 'seg',
      minutes: 'min',
      hours: 'h',
      days: 'd',
    };
    return `${value}${labels[unit] || unit}`;
  };

  return (
    <NodeAnalyticsWrapper nodeId={id}>
      <div className="bg-card border-2 border-cyan-500 rounded-lg p-3 shadow-md min-w-[200px]">
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
        
        <div className="text-xs text-muted-foreground space-y-1">
          <div className="truncate max-w-[180px]">
            {nodeData.variableName ? `→ ${nodeData.variableName}` : 'Configure a variável...'}
          </div>
          
          {nodeData.timeoutEnabled && (
            <div className="flex items-center gap-1 text-orange-400">
              <Clock className="h-3 w-3" />
              <span>Timeout: {formatTime(nodeData.timeout || 5, nodeData.timeoutUnit || 'minutes')}</span>
            </div>
          )}
          
          {nodeData.followUpEnabled && nodeData.timeoutEnabled && (
            <div className="flex items-center gap-1 text-yellow-400">
              <Bell className="h-3 w-3" />
              <span>Follow Up: {formatTime(nodeData.followUpDelay || 1, nodeData.followUpUnit || 'minutes')}</span>
            </div>
          )}
        </div>
        
        {/* Main output - Response received */}
        <Handle
          type="source"
          position={Position.Bottom}
          id="default"
          className="!bg-cyan-500 !w-3 !h-3"
          style={{ left: '25%' }}
        />
        
        {/* Follow up output - only shown when enabled */}
        {nodeData.followUpEnabled && nodeData.timeoutEnabled && (
          <Handle
            type="source"
            position={Position.Bottom}
            id="followup"
            className="!bg-yellow-500 !w-3 !h-3"
            style={{ left: '50%' }}
          />
        )}
        
        {/* Timeout output - only shown when enabled */}
        {nodeData.timeoutEnabled && (
          <Handle
            type="source"
            position={Position.Bottom}
            id="timeout"
            className="!bg-orange-500 !w-3 !h-3"
            style={{ left: nodeData.followUpEnabled ? '75%' : '75%' }}
          />
        )}
        
        {/* Labels below handles */}
        {(nodeData.timeoutEnabled || nodeData.followUpEnabled) && (
          <div className="flex justify-between text-[9px] text-muted-foreground mt-2 px-1">
            <span className="text-cyan-400">Resposta</span>
            {nodeData.followUpEnabled && nodeData.timeoutEnabled && (
              <span className="text-yellow-400">Follow Up</span>
            )}
            {nodeData.timeoutEnabled && (
              <span className="text-orange-400">Timeout</span>
            )}
          </div>
        )}
      </div>
    </NodeAnalyticsWrapper>
  );
};
