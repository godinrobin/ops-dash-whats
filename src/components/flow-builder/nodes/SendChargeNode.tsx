import { Handle, Position, NodeProps } from '@xyflow/react';
import { Banknote } from 'lucide-react';
import { NodeAnalyticsWrapper } from '../NodeAnalyticsWrapper';

export const SendChargeNode = ({ id, data }: NodeProps) => {
  const nodeData = data as { 
    amount?: number; 
    itemName?: string;
    description?: string;
  };
  
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { 
      style: 'currency', 
      currency: 'BRL' 
    }).format(value);
  };
  
  return (
    <NodeAnalyticsWrapper nodeId={id}>
      <div className="bg-card border-2 border-lime-500 rounded-lg p-3 shadow-md min-w-[180px]">
        <Handle
          type="target"
          position={Position.Top}
          className="!bg-lime-500 !w-3 !h-3"
        />
        <div className="flex items-center gap-2 mb-2">
          <div className="p-1.5 rounded bg-lime-500">
            <Banknote className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="font-medium text-sm">Enviar Cobrança</span>
        </div>
        <div className="text-xs text-muted-foreground space-y-1">
          {nodeData.amount !== undefined && nodeData.amount > 0 && (
            <div className="text-lime-500 font-bold text-base">
              {formatCurrency(nodeData.amount)}
            </div>
          )}
          {nodeData.itemName && (
            <div className="truncate max-w-[160px] font-medium">
              {nodeData.itemName}
            </div>
          )}
          {nodeData.description && (
            <div className="truncate max-w-[160px] text-muted-foreground/70">
              {nodeData.description}
            </div>
          )}
          {(!nodeData.amount || nodeData.amount <= 0) && !nodeData.itemName && (
            <div className="text-muted-foreground/50">Configure a cobrança...</div>
          )}
        </div>
        <Handle
          type="source"
          position={Position.Bottom}
          className="!bg-lime-500 !w-3 !h-3"
        />
      </div>
    </NodeAnalyticsWrapper>
  );
};
