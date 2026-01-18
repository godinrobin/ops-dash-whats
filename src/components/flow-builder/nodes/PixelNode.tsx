import { Handle, Position, NodeProps } from '@xyflow/react';
import { Megaphone } from 'lucide-react';
import { NodeAnalyticsWrapper } from '../NodeAnalyticsWrapper';

export const PixelNode = ({ id, data }: NodeProps) => {
  const nodeData = data as { pixelId?: string; pixelName?: string; eventType?: string };

  const getEventLabel = (eventType?: string) => {
    switch (eventType) {
      case 'Purchase': return 'Compra';
      case 'Lead': return 'Lead';
      case 'InitiateCheckout': return 'Iniciar Checkout';
      case 'AddToCart': return 'Add ao Carrinho';
      default: return 'Configure...';
    }
  };

  return (
    <NodeAnalyticsWrapper nodeId={id}>
      <div className="bg-card border-2 border-blue-600 rounded-lg p-3 shadow-md min-w-[180px]">
        <Handle
          type="target"
          position={Position.Top}
          className="!bg-blue-600 !w-3 !h-3"
        />
        <div className="flex items-center gap-2 mb-2">
          <div className="p-1.5 rounded bg-blue-600">
            <Megaphone className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="font-medium text-sm">Pixel</span>
        </div>
        <div className="text-xs text-muted-foreground truncate max-w-[160px]">
          {nodeData.pixelName || nodeData.pixelId 
            ? `${getEventLabel(nodeData.eventType)} → ${nodeData.pixelName || nodeData.pixelId?.slice(-6)}`
            : 'Configure pixel e evento...'}
        </div>
        <Handle
          type="source"
          position={Position.Bottom}
          className="!bg-blue-600 !w-3 !h-3"
        />
      </div>
    </NodeAnalyticsWrapper>
  );
};
