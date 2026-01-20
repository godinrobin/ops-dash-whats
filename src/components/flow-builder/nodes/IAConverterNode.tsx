import { Handle, Position, NodeProps } from '@xyflow/react';
import { MessageSquareHeart } from 'lucide-react';
import { NodeAnalyticsWrapper } from '../NodeAnalyticsWrapper';
import { Badge } from '@/components/ui/badge';

export const IAConverterNode = ({ id, data }: NodeProps) => {
  const nodeData = data as { 
    knowledgeBase?: string; 
    targetAudience?: 'homem' | 'mulher' | 'geral';
    useEmojis?: boolean;
    conversationTone?: 'formal' | 'informal' | 'neutro';
  };

  const getToneLabel = (tone?: string) => {
    switch (tone) {
      case 'formal': return 'Formal';
      case 'informal': return 'Informal';
      default: return 'Neutro';
    }
  };

  const getAudienceLabel = (audience?: string) => {
    switch (audience) {
      case 'homem': return '👨 Homem';
      case 'mulher': return '👩 Mulher';
      default: return '👥 Geral';
    }
  };

  return (
    <NodeAnalyticsWrapper nodeId={id}>
      <div className="bg-card border-2 border-emerald-500 rounded-lg p-3 shadow-md min-w-[200px]">
        <Handle
          type="target"
          position={Position.Top}
          className="!bg-emerald-500 !w-3 !h-3"
        />
        <div className="flex items-center gap-2 mb-2">
          <div className="p-1.5 rounded bg-gradient-to-r from-emerald-500 to-teal-500">
            <MessageSquareHeart className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="font-medium text-sm">IA Converter</span>
        </div>
        
        <div className="space-y-1.5">
          <div className="flex flex-wrap gap-1">
            <Badge variant="outline" className="text-[10px] px-1.5">
              {getAudienceLabel(nodeData.targetAudience)}
            </Badge>
            <Badge variant="outline" className="text-[10px] px-1.5">
              {getToneLabel(nodeData.conversationTone)}
            </Badge>
            {nodeData.useEmojis && (
              <Badge variant="outline" className="text-[10px] px-1.5">
                ✨ Emojis
              </Badge>
            )}
          </div>
          
          <div className="text-xs text-muted-foreground truncate max-w-[180px]">
            {nodeData.knowledgeBase 
              ? `📚 ${nodeData.knowledgeBase.substring(0, 30)}...` 
              : 'Configure a base de conhecimento...'}
          </div>
        </div>
        
        {/* No output handle - this node only receives connections */}
      </div>
    </NodeAnalyticsWrapper>
  );
};
