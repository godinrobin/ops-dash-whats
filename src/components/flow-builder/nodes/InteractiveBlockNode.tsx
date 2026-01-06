import { Handle, Position, NodeProps } from '@xyflow/react';
import { MousePointer2 } from 'lucide-react';
import { NodeAnalyticsWrapper } from '../NodeAnalyticsWrapper';

export const InteractiveBlockNode = ({ id, data }: NodeProps) => {
  const nodeData = data as { 
    interactionType?: 'poll' | 'button' | 'imageButton' | 'list';
    text?: string;
    choices?: string[];
  };
  
  const getInteractionLabel = () => {
    switch (nodeData.interactionType) {
      case 'poll': return 'Enquete';
      case 'button': return 'Botões';
      case 'imageButton': return 'Imagem + Botões';
      case 'list': return 'Menu Lista';
      default: return 'Bloco Interativo';
    }
  };

  const choicesCount = nodeData.choices?.length || 0;
  const hasText = !!nodeData.text;

  return (
    <NodeAnalyticsWrapper nodeId={id}>
      <div className="bg-card border-2 border-fuchsia-500 rounded-lg p-3 shadow-md min-w-[180px]">
        <Handle
          type="target"
          position={Position.Top}
          className="!bg-fuchsia-500 !w-3 !h-3"
        />
        <div className="flex items-center gap-2 mb-2">
          <div className="p-1.5 rounded bg-gradient-to-r from-fuchsia-500 to-pink-500">
            <MousePointer2 className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="font-medium text-sm">{getInteractionLabel()}</span>
        </div>
        <div className="text-xs text-muted-foreground">
          {hasText 
            ? `${choicesCount > 0 ? `${choicesCount} opções` : 'Configure as opções...'}`
            : 'Configure a mensagem...'}
        </div>
        <Handle
          type="source"
          position={Position.Bottom}
          className="!bg-fuchsia-500 !w-3 !h-3"
        />
      </div>
    </NodeAnalyticsWrapper>
  );
};
