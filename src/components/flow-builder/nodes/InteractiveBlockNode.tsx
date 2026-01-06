import { Handle, Position, NodeProps } from '@xyflow/react';
import { MousePointer2 } from 'lucide-react';
import { NodeAnalyticsWrapper } from '../NodeAnalyticsWrapper';

export const InteractiveBlockNode = ({ id, data }: NodeProps) => {
  const nodeData = data as { 
    interactionType?: 'button' | 'imageButton' | 'list';
    text?: string;
    choices?: string[];
  };
  
  const interactionType = nodeData.interactionType || 'button';
  
  const getInteractionLabel = () => {
    switch (interactionType) {
      case 'button': return 'Botões';
      case 'imageButton': return 'Imagem + Botões';
      case 'list': return 'Menu Lista';
      default: return 'Mensagem Interativa';
    }
  };

  // Extract choice labels for output handles
  const getChoiceLabel = (choice: string, index: number): string => {
    const trimmed = choice.trim();
    
    // Skip section headers in list type (starts with [)
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      return '';
    }
    
    // Get the display text (before the first |)
    const parts = trimmed.split('|');
    const label = parts[0].trim();
    
    return label || `Opção ${index + 1}`;
  };

  // Filter out section headers and get valid choices
  const validChoices = (nodeData.choices || [])
    .map((choice, index) => ({ choice, index, label: getChoiceLabel(choice, index) }))
    .filter(item => item.label !== '');

  const hasText = !!nodeData.text;

  return (
    <NodeAnalyticsWrapper nodeId={id}>
      <div className="bg-card border-2 border-fuchsia-500 rounded-lg p-3 shadow-md min-w-[200px]">
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
        <div className="text-xs text-muted-foreground mb-2">
          {hasText 
            ? `${validChoices.length > 0 ? `${validChoices.length} opções` : 'Configure as opções...'}`
            : 'Configure a mensagem...'}
        </div>
        
        {/* Dynamic output handles for each choice */}
        {validChoices.length > 0 && (
          <div className="space-y-1 mt-2 pt-2 border-t border-border">
            {validChoices.map((item, idx) => (
              <div key={idx} className="flex items-center justify-end gap-1 relative pr-3">
                <span className="text-[10px] text-muted-foreground truncate max-w-[140px]">
                  {item.label}
                </span>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={`choice-${item.index}`}
                  className="!bg-fuchsia-500 !w-2.5 !h-2.5 !right-0"
                  style={{ top: 'auto', position: 'relative' }}
                />
              </div>
            ))}
          </div>
        )}
        
        {/* Default output if no choices */}
        {validChoices.length === 0 && (
          <Handle
            type="source"
            position={Position.Bottom}
            className="!bg-fuchsia-500 !w-3 !h-3"
          />
        )}
      </div>
    </NodeAnalyticsWrapper>
  );
};
