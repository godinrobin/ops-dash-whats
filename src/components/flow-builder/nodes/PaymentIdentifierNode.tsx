import { Handle, Position, NodeProps } from '@xyflow/react';
import { Receipt, Check, X, Clock } from 'lucide-react';
import { NodeAnalyticsWrapper } from '../NodeAnalyticsWrapper';

export const PaymentIdentifierNode = ({ id, data }: NodeProps) => {
  const nodeData = data as { 
    checkImage?: boolean; 
    checkPdf?: boolean; 
    markAsPaid?: boolean;
    maxAttempts?: number;
    noResponseDelayValue?: number;
    noResponseDelayUnit?: 'seconds' | 'minutes';
  };
  
  const delayValue = nodeData.noResponseDelayValue || 5;
  const delayUnit = nodeData.noResponseDelayUnit || 'minutes';
  const delayDisplay = `${delayValue} ${delayUnit === 'seconds' ? 's' : 'min'}`;
  
  return (
    <NodeAnalyticsWrapper nodeId={id}>
      <div className="bg-card border-2 border-emerald-500 rounded-lg p-3 shadow-md min-w-[220px]">
        <Handle
          type="target"
          position={Position.Top}
          className="!bg-emerald-500 !w-3 !h-3"
        />
        <div className="flex items-center gap-2 mb-2">
          <div className="p-1.5 rounded bg-emerald-500">
            <Receipt className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="font-medium text-sm">Identificar Pagamento</span>
        </div>
        <div className="text-xs text-muted-foreground space-y-1">
          <div className="flex items-center gap-1 flex-wrap">
            {nodeData.checkImage && <span className="bg-emerald-500/20 text-emerald-600 px-1.5 py-0.5 rounded text-[10px]">Imagem</span>}
            {nodeData.checkPdf && <span className="bg-emerald-500/20 text-emerald-600 px-1.5 py-0.5 rounded text-[10px]">PDF</span>}
            {nodeData.markAsPaid && <span className="bg-emerald-500/20 text-emerald-600 px-1.5 py-0.5 rounded text-[10px]">Marca Pago</span>}
          </div>
          <div>Tentativas: {nodeData.maxAttempts || 3}</div>
          <div className="flex items-center gap-1">
            <Clock className="h-2.5 w-2.5" />
            Sem resposta: {delayDisplay}
          </div>
        </div>
        {/* Three output handles: Paid (left), No Response (center), Not Paid (right) */}
        <div className="flex justify-between mt-3 relative gap-2">
          <div className="flex flex-col items-center">
            <div className="text-[10px] text-emerald-500 font-medium mb-1 flex items-center gap-0.5">
              <Check className="h-2.5 w-2.5" /> Pagou
            </div>
            <Handle
              type="source"
              position={Position.Bottom}
              id="paid"
              className="!bg-emerald-500 !w-3 !h-3 !relative !transform-none !left-0"
              style={{ position: 'relative', left: 0, transform: 'none' }}
            />
          </div>
          <div className="flex flex-col items-center">
            <div className="text-[10px] text-amber-500 font-medium mb-1 flex items-center gap-0.5">
              <Clock className="h-2.5 w-2.5" /> Sem Resp.
            </div>
            <Handle
              type="source"
              position={Position.Bottom}
              id="noResponse"
              className="!bg-amber-500 !w-3 !h-3 !relative !transform-none !left-0"
              style={{ position: 'relative', left: 0, transform: 'none' }}
            />
          </div>
          <div className="flex flex-col items-center">
            <div className="text-[10px] text-red-500 font-medium mb-1 flex items-center gap-0.5">
              <X className="h-2.5 w-2.5" /> Não Pagou
            </div>
            <Handle
              type="source"
              position={Position.Bottom}
              id="notPaid"
              className="!bg-red-500 !w-3 !h-3 !relative !transform-none !left-0"
              style={{ position: 'relative', left: 0, transform: 'none' }}
            />
          </div>
        </div>
      </div>
    </NodeAnalyticsWrapper>
  );
};
