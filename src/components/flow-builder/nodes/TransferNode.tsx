import { Handle, Position, NodeProps } from '@xyflow/react';
import { UserPlus } from 'lucide-react';

export const TransferNode = ({ data }: NodeProps) => {
  const nodeData = data as { transferTo?: string };

  return (
    <div className="bg-card border-2 border-teal-500 rounded-lg p-3 shadow-md min-w-[180px]">
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-teal-500 !w-3 !h-3"
      />
      <div className="flex items-center gap-2 mb-2">
        <div className="p-1.5 rounded bg-teal-500">
          <UserPlus className="h-3.5 w-3.5 text-white" />
        </div>
        <span className="font-medium text-sm">Transferir</span>
      </div>
      <div className="text-xs text-muted-foreground">
        {nodeData.transferTo === 'human' ? 'Atendente' : 'Departamento'}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-teal-500 !w-3 !h-3"
      />
    </div>
  );
};
