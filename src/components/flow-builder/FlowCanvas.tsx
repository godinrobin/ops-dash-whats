import { useCallback, useState, useEffect, useRef, useMemo } from 'react';
import {
  ReactFlow,
  Background,
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
import { Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

import { StartNode } from './nodes/StartNode';
import { TextNode } from './nodes/TextNode';
import { AITextNode } from './nodes/AITextNode';
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
import { InteractiveBlockNode } from './nodes/InteractiveBlockNode';
import { PixelNode } from './nodes/PixelNode';
import { NodeSidebar } from './NodeSidebar';
import { PropertiesPanel } from './PropertiesPanel';
import { useFlowValidation } from './hooks/useFlowValidation';
import { FlowAnalyticsProvider } from './FlowAnalyticsContext';
import { useFlowAnalytics } from '@/hooks/useFlowAnalytics';

const nodeTypes = {
  start: StartNode,
  text: TextNode,
  aiText: AITextNode,
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
  interactiveBlock: InteractiveBlockNode,
  pixel: PixelNode,
};

interface FlowCanvasProps {
  initialNodes: Node[];
  initialEdges: { id: string; source: string; target: string; sourceHandle?: string; targetHandle?: string }[];
  onSave: (
    nodes: Node[],
    edges: { id: string; source: string; target: string; sourceHandle?: string; targetHandle?: string }[],
    silent?: boolean
  ) => void | Promise<void>;
  triggerType?: 'keyword' | 'all' | 'schedule';
  triggerKeywords?: string[];
  keywordMatchType?: 'exact' | 'contains' | 'not_contains';
  onUpdateFlowSettings?: (settings: { triggerType?: string; triggerKeywords?: string[]; keywordMatchType?: string }) => void;
  flowId?: string;
}

const FlowCanvasInner = ({ initialNodes, initialEdges, onSave, triggerType, triggerKeywords, keywordMatchType, onUpdateFlowSettings, flowId }: FlowCanvasProps) => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, fitView } = useReactFlow();
  
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

  // Silent auto-save function (no feedback)
  const silentAutoSave = useCallback(async () => {
    // Wait a tick for state to update
    setTimeout(async () => {
      const latestNodes = latestNodesRef.current;
      const latestEdges = latestEdgesRef.current;

      const nodesToSave = latestNodes.map((n) => {
        const data = { ...(n.data as Record<string, unknown>) };
        delete (data as any).undefinedVariables;
        return { ...n, data };
      });

      try {
        await onSave(nodesToSave as any, latestEdges as any, true); // silent = true
      } catch {
        // Silent fail - no feedback
      }
    }, 100);
  }, [onSave]);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow');
      if (!type || !reactFlowWrapper.current) return;

      // Prevent adding more than one start node
      if (type === 'start') {
        const hasStartNode = latestNodesRef.current.some(n => n.type === 'start');
        if (hasStartNode) {
          return; // Don't allow adding another start node
        }
      }

      // Get the bounds of the ReactFlow wrapper
      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      
      // XYFlow expects coordinates relative to the wrapper
      const position = screenToFlowPosition({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });

      // Find next available variable number by checking existing nodes
      const getNextVariableNumber = (prefix: string) => {
        const usedNumbers: number[] = [];
        latestNodesRef.current.forEach(n => {
          const varName = n.data?.variableName as string;
          if (varName?.startsWith(prefix)) {
            const numMatch = varName.match(new RegExp(`^${prefix}(\\d+)$`));
            if (numMatch) {
              usedNumbers.push(parseInt(numMatch[1], 10));
            }
          }
        });
        
        // Find the highest number and add 1
        if (usedNumbers.length === 0) return 1;
        return Math.max(...usedNumbers) + 1;
      };
      
      // Generate default data based on node type
      const getDefaultData = (nodeType: string) => {
        const baseData = { label: getNodeLabel(nodeType) };
        
        // Auto-fill variable names for waitInput nodes
        if (nodeType === 'waitInput') {
          const nextNum = getNextVariableNumber('resposta');
          return { ...baseData, variableName: `resposta${nextNum}` };
        }
        
        // Auto-fill variable names for setVariable nodes
        if (nodeType === 'setVariable') {
          const nextNum = getNextVariableNumber('variavel');
          return { ...baseData, variableName: `variavel${nextNum}` };
        }
        
        return baseData;
      };

      const newNode: Node = {
        id: `${type}-${Date.now()}`,
        type,
        position,
        data: getDefaultData(type),
      };

      setNodes((nds) => [...nds, newNode]);
      
      // Auto-save after adding new node
      setTimeout(() => silentAutoSave(), 200);
    },
    [setNodes, screenToFlowPosition, silentAutoSave]
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
      pixel: 'Pixel Facebook',
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
    
    // Auto-save after duplicating node
    setTimeout(() => silentAutoSave(), 200);
  }, [nodes, setNodes, silentAutoSave]);

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
    
    // Auto-save after deleting node
    setTimeout(() => silentAutoSave(), 200);
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
      await onSave(nodesToSave as any, latestEdges as any, false); // silent = false for manual save
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
          className="bg-background"
          proOptions={{ hideAttribution: true }}
          deleteKeyCode={['Backspace', 'Delete']}
          onEdgeClick={(_, edge) => {
            setEdges((eds) => eds.filter((e) => e.id !== edge.id));
          }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} className="!bg-background" />
        </ReactFlow>
        
        {/* Fit View button in bottom left */}
        <Button
          variant="outline"
          size="icon"
          className="absolute bottom-12 left-4 z-10 bg-card border-border shadow-md hover:bg-accent"
          onClick={() => fitView({ padding: 0.2, duration: 300 })}
          title="Centralizar e ver todo o fluxo"
        >
          <Maximize2 className="h-4 w-4" />
        </Button>
      </div>

      <PropertiesPanel
        selectedNode={selectedNode}
        onUpdateNode={handleUpdateNode}
        onDeleteNode={handleDeleteNode}
        onDuplicateNode={handleDuplicateNode}
        onSave={handleSave}
        triggerType={triggerType}
        triggerKeywords={triggerKeywords}
        keywordMatchType={keywordMatchType}
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
