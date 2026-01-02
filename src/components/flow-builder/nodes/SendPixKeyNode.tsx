import { Handle, Position, NodeProps } from '@xyflow/react';
import { QrCode } from 'lucide-react';
import { NodeAnalyticsWrapper } from '../NodeAnalyticsWrapper';

export const SendPixKeyNode = ({ id, data }: NodeProps) => {
  const nodeData = data as { 
    pixKey?: string; 
    pixType?: string;
    pixName?: string;
  };
  
  const pixTypeLabels: Record<string, string> = {
    CPF: 'CPF',
    CNPJ: 'CNPJ',
    PHONE: 'Telefone',
    EMAIL: 'E-mail',
    EVP: 'Chave Aleatória',
  };
  
  return (
    <NodeAnalyticsWrapper nodeId={id}>
      <div className="bg-card border-2 border-teal-500 rounded-lg p-3 shadow-md min-w-[180px]">
        <Handle
          type="target"
          position={Position.Top}
          className="!bg-teal-500 !w-3 !h-3"
        />
        <div className="flex items-center gap-2 mb-2">
          <div className="p-1.5 rounded bg-teal-500">
            <QrCode className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="font-medium text-sm">Enviar Chave PIX</span>
        </div>
        <div className="text-xs text-muted-foreground space-y-1">
          {nodeData.pixType && (
            <div className="flex items-center gap-1">
              <span className="text-teal-500 font-medium">{pixTypeLabels[nodeData.pixType] || nodeData.pixType}</span>
            </div>
          )}
          {nodeData.pixKey && (
            <div className="truncate max-w-[160px]">
              {nodeData.pixKey}
            </div>
          )}
          {nodeData.pixName && (
            <div className="truncate max-w-[160px] text-muted-foreground/70">
              {nodeData.pixName}
            </div>
          )}
          {!nodeData.pixKey && (
            <div className="text-muted-foreground/50">Configure a chave PIX...</div>
          )}
        </div>
        <Handle
          type="source"
          position={Position.Bottom}
          className="!bg-teal-500 !w-3 !h-3"
        />
      </div>
    </NodeAnalyticsWrapper>
  );
};
