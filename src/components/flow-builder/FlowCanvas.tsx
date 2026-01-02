import { useCallback, useState, useEffect, useRef, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Connection,
  Node,
  BackgroundVariant,
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { StartNode } from './nodes/StartNode';
import { TextNode } from './nodes/TextNode';
import { ImageNode } from './nodes/ImageNode';
import { AudioNode } from './nodes/AudioNode';
import { VideoNode } from './nodes/VideoNode';
import { DocumentNode } from './nodes/DocumentNode';
import { DelayNode } from './nodes/DelayNode';
import { WaitInputNode } from './nodes/WaitInputNode';
import { ConditionNode } from './nodes/ConditionNode';
import { MenuNode } from './nodes/MenuNode';
import { AINode } from './nodes/AINode';
import { TransferNode } from './nodes/TransferNode';
import { WebhookNode } from './nodes/WebhookNode';
import { SetVariableNode } from './nodes/SetVariableNode';
import { TagNode } from './nodes/TagNode';
import { EndNode } from './nodes/EndNode';
import { RandomizerNode } from './nodes/RandomizerNode';
import { PaymentIdentifierNode } from './nodes/PaymentIdentifierNode';
import { SendPixKeyNode } from './nodes/SendPixKeyNode';
import { SendChargeNode } from './nodes/SendChargeNode';
import { NodeSidebar } from './NodeSidebar';
import { PropertiesPanel } from './PropertiesPanel';
import { useFlowValidation } from './hooks/useFlowValidation';
import { FlowAnalyticsProvider } from './FlowAnalyticsContext';
import { useFlowAnalytics } from '@/hooks/useFlowAnalytics';

const nodeTypes = {
  start: StartNode,
  text: TextNode,
  image: ImageNode,
  audio: AudioNode,
  video: VideoNode,
  document: DocumentNode,
  delay: DelayNode,
  waitInput: WaitInputNode,
  condition: ConditionNode,
  menu: MenuNode,
  ai: AINode,
  transfer: TransferNode,
  webhook: WebhookNode,
  setVariable: SetVariableNode,
  tag: TagNode,
  end: EndNode,
  randomizer: RandomizerNode,
  paymentIdentifier: PaymentIdentifierNode,
  sendPixKey: SendPixKeyNode,
  sendCharge: SendChargeNode,
};

interface FlowCanvasProps {
  initialNodes: Node[];
  initialEdges: { id: string; source: string; target: string; sourceHandle?: string; targetHandle?: string }[];
  onSave: (
    nodes: Node[],
    edges: { id: string; source: string; target: string; sourceHandle?: string; targetHandle?: string }[]
  ) => void | Promise<void>;
  triggerType?: 'keyword' | 'all' | 'schedule';
  triggerKeywords?: string[];
  onUpdateFlowSettings?: (settings: { triggerType?: string; triggerKeywords?: string[] }) => void;
  flowId?: string;
}

const FlowCanvasInner = ({ initialNodes, initialEdges, onSave, triggerType, triggerKeywords, onUpdateFlowSettings, flowId }: FlowCanvasProps) => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();
  
  // Flow analytics for node badges
  const { analytics, loading: analyticsLoading } = useFlowAnalytics(flowId || '', 'today');
  
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes.length > 0 ? initialNodes : [
    {
      id: 'start-1',
      type: 'start',
      position: { x: 250, y: 50 },
      data: { label: 'Início' },
    },
  ]);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  const latestNodesRef = useRef<Node[]>([]);
  const latestEdgesRef = useRef<typeof initialEdges>([]);

  // Validate flow and get warnings for condition nodes
  const validationResults = useFlowValidation(nodes, edges);

  // Apply validation data to nodes
  const nodesWithValidation = useMemo(() => {
    return nodes.map(node => {
      if (node.type === 'condition') {
        const validation = validationResults.get(node.id);
        return {
          ...node,
          data: {
            ...node.data,
            undefinedVariables: validation?.undefinedVariables || [],
          },
        };
      }
      return node;
    });
  }, [nodes, validationResults]);

  useEffect(() => {
    // Keep refs in sync so we can always save the latest canvas state
    latestNodesRef.current = nodes;
    latestEdgesRef.current = edges as any;

    // Also keep selectedNode data synced with the latest nodes
    if (selectedNode) {
      const fresh = nodes.find((n) => n.id === selectedNode.id) || null;
      if (fresh && fresh !== selectedNode) setSelectedNode(fresh);
    }
  }, [nodes, edges, selectedNode]);

  useEffect(() => {
    if (initialNodes.length > 0) {
      setNodes(initialNodes);
    }
    if (initialEdges.length > 0) {
      setEdges(initialEdges);
    }
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow');
      if (!type || !reactFlowWrapper.current) return;

      // Get the bounds of the ReactFlow wrapper
      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      
      // XYFlow expects coordinates relative to the wrapper
      const position = screenToFlowPosition({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });

      console.log('Drop event:', { 
        clientX: event.clientX, 
        clientY: event.clientY, 
        bounds: { left: bounds.left, top: bounds.top },
        position 
      });

      const newNode: Node = {
        id: `${type}-${Date.now()}`,
        type,
        position,
        data: { label: getNodeLabel(type) },
      };

      setNodes((nds) => [...nds, newNode]);
    },
    [setNodes, screenToFlowPosition]
  );
  
  const onInit = useCallback((instance: any) => {
    setReactFlowInstance(instance);

    // Ensure our refs start with the real instance state
    try {
      latestNodesRef.current = instance.getNodes?.() || latestNodesRef.current;
      latestEdgesRef.current = instance.getEdges?.() || latestEdgesRef.current;
    } catch {
      // ignore
    }
  }, []);

  const getNodeLabel = (type: string): string => {
    const labels: Record<string, string> = {
      start: 'Início',
      text: 'Mensagem de Texto',
      image: 'Enviar Imagem',
      audio: 'Enviar Áudio',
      video: 'Enviar Vídeo',
      document: 'Enviar Documento',
      delay: 'Aguardar',
      waitInput: 'Aguardar Resposta',
      condition: 'Condição',
      menu: 'Menu de Opções',
      ai: 'Resposta IA',
      transfer: 'Transferir',
      webhook: 'Webhook',
      setVariable: 'Definir Variável',
      tag: 'Adicionar Tag',
      end: 'Fim',
      randomizer: 'Randomizador',
      paymentIdentifier: 'Identificar Pagamento',
      sendPixKey: 'Enviar Chave PIX',
      sendCharge: 'Enviar Cobrança',
      call: 'Ligar',
    };
    return labels[type] || type;
  };

  const handleDuplicateNode = useCallback((nodeId: string) => {
    const nodeToDuplicate = nodes.find(n => n.id === nodeId);
    if (!nodeToDuplicate || nodeToDuplicate.type === 'start') return;

    const newNode: Node = {
      id: `${nodeToDuplicate.type}-${Date.now()}`,
      type: nodeToDuplicate.type,
      position: {
        x: nodeToDuplicate.position.x + 50,
        y: nodeToDuplicate.position.y + 50,
      },
      data: JSON.parse(JSON.stringify(nodeToDuplicate.data)),
    };

    setNodes((nds) => [...nds, newNode]);
    setSelectedNode(newNode);
  }, [nodes, setNodes]);

  const handleUpdateNode = (nodeId: string, data: Record<string, unknown>) => {
    setNodes((nds) =>
      nds.map((node) =>
        node.id === nodeId ? { ...node, data: { ...node.data, ...data } } : node
      )
    );
    if (selectedNode?.id === nodeId) {
      setSelectedNode((prev) => prev ? { ...prev, data: { ...prev.data, ...data } } : null);
    }
  };

  const handleDeleteNode = (nodeId: string) => {
    setNodes((nds) => nds.filter((node) => node.id !== nodeId));
    setEdges((eds) => eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
    if (selectedNode?.id === nodeId) {
      setSelectedNode(null);
    }
  };

  const handleSave = async () => {
    setSaveStatus('saving');

    // Always save the latest state captured from React state (refs)
    const latestNodes = latestNodesRef.current;
    const latestEdges = latestEdgesRef.current;

    // Do not persist validation-only fields
    const nodesToSave = latestNodes.map((n) => {
      const data = { ...(n.data as Record<string, unknown>) };
      delete (data as any).undefinedVariables;
      return { ...n, data };
    });

    try {
      await onSave(nodesToSave as any, latestEdges as any);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      // Backend already reports errors via toast; just reset visual status.
      setSaveStatus('idle');
    }
  };

  return (
    <FlowAnalyticsProvider 
      nodeStats={analytics?.nodeStats || new Map()} 
      totalSessions={analytics?.totalSessions || 0}
      isLoading={analyticsLoading}
    >
    <div className="flex w-full overflow-hidden" style={{ height: 'calc(100vh - 140px)' }}>
      <NodeSidebar />
      
      <div 
        className="flex-1 relative" 
        ref={reactFlowWrapper}
        style={{ height: '100%' }}
      >
        {/* Auto-save status indicator */}
        {saveStatus !== 'idle' && (
          <div className="absolute top-2 left-1/2 transform -translate-x-1/2 z-10">
            <div className={`px-3 py-1 rounded-full text-xs font-medium ${
              saveStatus === 'saving' 
                ? 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/30' 
                : 'bg-green-500/20 text-green-500 border border-green-500/30'
            }`}>
              {saveStatus === 'saving' ? 'Salvando...' : 'Salvo ✓'}
            </div>
          </div>
        )}
        
        <ReactFlow
          nodes={nodesWithValidation}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onInit={onInit}
          nodeTypes={nodeTypes}
          fitView
          colorMode="dark"
          proOptions={{ hideAttribution: true }}
          deleteKeyCode={['Backspace', 'Delete']}
          onEdgeClick={(_, edge) => {
            setEdges((eds) => eds.filter((e) => e.id !== edge.id));
          }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
          <Controls />
        </ReactFlow>
      </div>

      <PropertiesPanel
        selectedNode={selectedNode}
        onUpdateNode={handleUpdateNode}
        onDeleteNode={handleDeleteNode}
        onDuplicateNode={handleDuplicateNode}
        onSave={handleSave}
        triggerType={triggerType}
        triggerKeywords={triggerKeywords}
        onUpdateFlowSettings={onUpdateFlowSettings}
        allNodes={nodes}
      />
    </div>
    </FlowAnalyticsProvider>
  );
};

export const FlowCanvas = (props: FlowCanvasProps) => {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner {...props} />
    </ReactFlowProvider>
  );
};
