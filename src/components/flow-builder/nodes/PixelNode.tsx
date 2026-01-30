import { Handle, Position, NodeProps } from '@xyflow/react';
import { Megaphone, RefreshCw } from 'lucide-react';
import { NodeAnalyticsWrapper } from '../NodeAnalyticsWrapper';

export const PixelNode = ({ id, data }: NodeProps) => {
  const nodeData = data as { 
    pixelId?: string; 
    pixelName?: string; 
    eventType?: string;
    eventValue?: string;
    tryAllPixels?: boolean;
  };

  const getEventLabel = (eventType?: string) => {
    switch (eventType) {
      case 'Purchase': return 'Compra';
      case 'Lead': return 'Lead';
      case 'InitiateCheckout': return 'Iniciar Checkout';
      case 'AddToCart': return 'Add ao Carrinho';
      default: return 'Configure...';
    }
  };

  const isTryAll = nodeData.tryAllPixels || nodeData.pixelId === '__ALL_PIXELS__';
  const hasValue = nodeData.eventValue && nodeData.eventValue.trim().length > 0;

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
            {isTryAll ? (
              <RefreshCw className="h-3.5 w-3.5 text-white" />
            ) : (
              <Megaphone className="h-3.5 w-3.5 text-white" />
            )}
          </div>
          <span className="font-medium text-sm">Pixel</span>
          {isTryAll && (
            <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">
              Todos
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground truncate max-w-[160px]">
          {isTryAll 
            ? `${getEventLabel(nodeData.eventType)} → Todos os Pixels`
            : nodeData.pixelName || nodeData.pixelId 
              ? `${getEventLabel(nodeData.eventType)} → ${nodeData.pixelName || nodeData.pixelId?.slice(-6)}`
              : 'Configure pixel e evento...'}
        </div>
        {hasValue && (
          <div className="text-[10px] text-emerald-400 mt-1 truncate">
            Valor: {nodeData.eventValue}
          </div>
        )}
        <Handle
          type="source"
          position={Position.Bottom}
          className="!bg-blue-600 !w-3 !h-3"
        />
      </div>
    </NodeAnalyticsWrapper>
  );
};
