import { Handle, Position, NodeProps } from '@xyflow/react';
import { Image } from 'lucide-react';

export const ImageNode = ({ data }: NodeProps) => {
  return (
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
        <span className="font-medium text-sm">Imagem</span>
      </div>
      <div className="text-xs text-muted-foreground truncate max-w-[160px]">
        {(data as { mediaUrl?: string })?.mediaUrl || 'Configure a URL...'}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-purple-500 !w-3 !h-3"
      />
    </div>
  );
};
