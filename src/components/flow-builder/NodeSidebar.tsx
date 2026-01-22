import { 
  MessageSquare, 
  Image, 
  Mic, 
  Video, 
  Clock, 
  MessageCircle,
  GitBranch,
  List,
  Bot,
  Tag,
  Play,
  FileText,
  Shuffle,
  Receipt,
  QrCode,
  Banknote,
  Sparkles,
  MousePointer2,
  Megaphone,
  Bell
} from 'lucide-react';

const nodeCategories = [
  {
    title: 'Mensagens',
    nodes: [
      { type: 'text', label: 'Texto', icon: MessageSquare, color: 'bg-blue-500' },
      { type: 'aiText', label: 'Texto com IA', icon: Sparkles, color: 'bg-gradient-to-r from-violet-500 to-purple-500' },
      { type: 'image', label: 'Imagem', icon: Image, color: 'bg-purple-500' },
      { type: 'audio', label: 'Áudio', icon: Mic, color: 'bg-orange-500' },
      { type: 'video', label: 'Vídeo', icon: Video, color: 'bg-pink-500' },
      { type: 'document', label: 'Documento', icon: FileText, color: 'bg-red-500' },
      { type: 'interactiveBlock', label: 'Mensagem Interativa', icon: MousePointer2, color: 'bg-gradient-to-r from-fuchsia-500 to-pink-500' },
    ],
  },
  {
    title: 'Controle',
    nodes: [
      { type: 'delay', label: 'Delay', icon: Clock, color: 'bg-yellow-500' },
      { type: 'waitInput', label: 'Aguardar Resposta', icon: MessageCircle, color: 'bg-cyan-500' },
      { type: 'condition', label: 'Condição', icon: GitBranch, color: 'bg-red-500' },
      { type: 'randomizer', label: 'Randomizador', icon: Shuffle, color: 'bg-violet-500' },
      { type: 'pixel', label: 'Pixel', icon: Megaphone, color: 'bg-blue-600' },
    ],
  },
  {
    title: 'Ações',
    nodes: [
      { type: 'tag', label: 'Tag', icon: Tag, color: 'bg-amber-500' },
      { type: 'paymentIdentifier', label: 'Identificar Pagamento', icon: Receipt, color: 'bg-emerald-500' },
      { type: 'sendPixKey', label: 'Enviar Chave PIX', icon: QrCode, color: 'bg-teal-500' },
      { type: 'sendCharge', label: 'Enviar Cobrança', icon: Banknote, color: 'bg-lime-500' },
      { type: 'notifyAdmin', label: 'Notificar Admin', icon: Bell, color: 'bg-rose-500' },
    ],
  },
];

export const NodeSidebar = () => {
  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="w-56 bg-background border-r border-border p-4 overflow-y-auto">
      <h3 className="font-semibold mb-4 text-sm">Componentes</h3>
      
      {nodeCategories.map((category) => (
        <div key={category.title} className="mb-4">
          <h4 className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
            {category.title}
          </h4>
          <div className="space-y-1">
            {category.nodes.map((node) => (
              <div
                key={node.type}
                className="flex items-center gap-2 p-2 rounded-lg border border-border bg-card hover:bg-accent cursor-grab active:cursor-grabbing transition-colors"
                draggable
                onDragStart={(e) => onDragStart(e, node.type)}
              >
                <div className={`p-1.5 rounded ${node.color}`}>
                  <node.icon className="h-3.5 w-3.5 text-white" />
                </div>
                <span className="text-sm">{node.label}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
