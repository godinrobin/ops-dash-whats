import { Handle, Position, NodeProps } from '@xyflow/react';
import { Video } from 'lucide-react';

export const VideoNode = ({ data }: NodeProps) => {
  return (
    <div className="bg-card border-2 border-pink-500 rounded-lg p-3 shadow-md min-w-[180px]">
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-pink-500 !w-3 !h-3"
      />
      <div className="flex items-center gap-2 mb-2">
        <div className="p-1.5 rounded bg-pink-500">
          <Video className="h-3.5 w-3.5 text-white" />
        </div>
        <span className="font-medium text-sm">Vídeo</span>
      </div>
      <div className="text-xs text-muted-foreground truncate max-w-[160px]">
        {(data as { mediaUrl?: string })?.mediaUrl || 'Configure a URL...'}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-pink-500 !w-3 !h-3"
      />
    </div>
  );
};
