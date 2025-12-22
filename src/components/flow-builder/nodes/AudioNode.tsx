import { Handle, Position, NodeProps } from '@xyflow/react';
import { Mic, CheckCircle } from 'lucide-react';

export const AudioNode = ({ data }: NodeProps) => {
  const mediaUrl = (data as { mediaUrl?: string })?.mediaUrl;
  const hasMedia = !!mediaUrl;

  return (
    <div className="bg-card border-2 border-orange-500 rounded-lg p-3 shadow-md min-w-[180px]">
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-orange-500 !w-3 !h-3"
      />
      <div className="flex items-center gap-2 mb-2">
        <div className="p-1.5 rounded bg-orange-500">
          <Mic className="h-3.5 w-3.5 text-white" />
        </div>
        <span className="font-medium text-sm">Áudio</span>
      </div>
      {hasMedia ? (
        <div className="flex items-center gap-2 text-xs text-green-500">
          <CheckCircle className="h-4 w-4" />
          <span>Áudio carregado</span>
        </div>
      ) : (
        <div className="text-xs text-muted-foreground truncate max-w-[160px]">
          Clique para configurar...
        </div>
      )}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-orange-500 !w-3 !h-3"
      />
    </div>
  );
};
