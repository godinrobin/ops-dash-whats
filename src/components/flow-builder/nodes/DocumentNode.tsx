import { Handle, Position, NodeProps } from '@xyflow/react';
import { FileText, CheckCircle } from 'lucide-react';
import { NodeAnalyticsWrapper } from '../NodeAnalyticsWrapper';

export const DocumentNode = ({ id, data }: NodeProps) => {
  const mediaUrl = (data as { mediaUrl?: string })?.mediaUrl;
  const fileName = (data as { fileName?: string })?.fileName;
  const hasMedia = !!mediaUrl;

  return (
    <NodeAnalyticsWrapper nodeId={id}>
      <div className="bg-card border-2 border-red-500 rounded-lg p-3 shadow-md min-w-[180px]">
        <Handle
          type="target"
          position={Position.Top}
          className="!bg-red-500 !w-3 !h-3"
        />
        <div className="flex items-center gap-2 mb-2">
          <div className="p-1.5 rounded bg-red-500">
            <FileText className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="font-medium text-sm">Documento</span>
        </div>
        {hasMedia ? (
          <div className="flex items-center gap-2 p-2 bg-muted/50 rounded">
            <FileText className="h-4 w-4 text-red-500" />
            <span className="text-xs truncate max-w-[120px]">{fileName || 'Documento'}</span>
            <CheckCircle className="h-4 w-4 text-green-500 ml-auto" />
          </div>
        ) : (
          <div className="text-xs text-muted-foreground truncate max-w-[160px]">
            Clique para configurar...
          </div>
        )}
        <Handle
          type="source"
          position={Position.Bottom}
          className="!bg-red-500 !w-3 !h-3"
        />
      </div>
    </NodeAnalyticsWrapper>
  );
};
