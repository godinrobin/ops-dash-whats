import { Handle, Position, NodeProps } from '@xyflow/react';
import { Image, CheckCircle } from 'lucide-react';
import { NodeAnalyticsWrapper } from '../NodeAnalyticsWrapper';

export const ImageNode = ({ id, data }: NodeProps) => {
  const mediaUrl = (data as { mediaUrl?: string })?.mediaUrl;
  const hasMedia = !!mediaUrl;

  return (
    <NodeAnalyticsWrapper nodeId={id}>
      <div className="bg-card border-2 border-purple-500 rounded-lg p-3 shadow-md min-w-[180px]">
        <Handle
          type="target"
          position={Position.Top}
          className="!bg-purple-500 !w-3 !h-3"
        />
        <div className="flex items-center gap-2 mb-2">
          <div className="p-1.5 rounded bg-purple-500">
            <Image className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="font-medium text-sm text-card-foreground">Imagem</span>
        </div>
        {hasMedia ? (
          <div className="relative">
            <img 
              src={mediaUrl} 
              alt="Preview" 
              className="w-full h-20 object-cover rounded"
            />
            <CheckCircle className="absolute top-1 right-1 h-4 w-4 text-green-500 bg-card rounded-full" />
          </div>
        ) : (
          <div className="text-xs text-muted-foreground truncate max-w-[160px]">
            Clique para configurar...
          </div>
        )}
        <Handle
          type="source"
          position={Position.Bottom}
          className="!bg-purple-500 !w-3 !h-3"
        />
      </div>
    </NodeAnalyticsWrapper>
  );
};
