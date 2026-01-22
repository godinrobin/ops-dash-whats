import { Handle, Position, NodeProps } from '@xyflow/react';
import { Bell } from 'lucide-react';
import { NodeAnalyticsWrapper } from '../NodeAnalyticsWrapper';

export const NotifyAdminNode = ({ id, data }: NodeProps) => {
  const nodeData = data as { 
    notificationType?: 'whatsapp' | 'push'; 
    targetPhone?: string;
    message?: string;
    pushTitle?: string;
    pushBody?: string;
  };

  const getPreviewText = () => {
    if (nodeData.notificationType === 'whatsapp') {
      return nodeData.targetPhone 
        ? `WhatsApp: ${nodeData.targetPhone}` 
        : 'Configure o WhatsApp...';
    } else if (nodeData.notificationType === 'push') {
      return nodeData.pushTitle 
        ? `Push: ${nodeData.pushTitle}` 
        : 'Configure o Push...';
    }
    return 'Configure a notificação...';
  };

  return (
    <NodeAnalyticsWrapper nodeId={id}>
      <div className="bg-card border-2 border-rose-500 rounded-lg p-3 shadow-md min-w-[180px]">
        <Handle
          type="target"
          position={Position.Top}
          className="!bg-rose-500 !w-3 !h-3"
        />
        <div className="flex items-center gap-2 mb-2">
          <div className="p-1.5 rounded bg-rose-500">
            <Bell className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="font-medium text-sm">Notificar Admin</span>
        </div>
        <div className="text-xs text-muted-foreground truncate max-w-[160px]">
          {getPreviewText()}
        </div>
        <Handle
          type="source"
          position={Position.Bottom}
          className="!bg-rose-500 !w-3 !h-3"
        />
      </div>
    </NodeAnalyticsWrapper>
  );
};
