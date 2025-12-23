import { useCallback, useState, useEffect, useRef } from 'react';
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
import { NodeSidebar } from './NodeSidebar';
import { PropertiesPanel } from './PropertiesPanel';

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
};

interface FlowCanvasProps {
  initialNodes: Node[];
  initialEdges: { id: string; source: string; target: string; sourceHandle?: string; targetHandle?: string }[];
  onSave: (nodes: Node[], edges: { id: string; source: string; target: string; sourceHandle?: string; targetHandle?: string }[]) => void;
  triggerType?: 'keyword' | 'all' | 'schedule';
  triggerKeywords?: string[];
  onUpdateFlowSettings?: (settings: { triggerType?: string; triggerKeywords?: string[] }) => void;
}

const FlowCanvasInner = ({ initialNodes, initialEdges, onSave, triggerType, triggerKeywords, onUpdateFlowSettings }: FlowCanvasProps) => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, getViewport } = useReactFlow();
  
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
  
  // Auto-save debounce timer
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasChangesRef = useRef(false);

  useEffect(() => {
    if (initialNodes.length > 0) {
      setNodes(initialNodes);
    }
    if (initialEdges.length > 0) {
      setEdges(initialEdges);
    }
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  // Auto-save effect - triggers when nodes or edges change
  useEffect(() => {
    // Skip initial render and empty flows
    if (nodes.length === 0 && edges.length === 0) return;
    
    // Mark that we have unsaved changes
    hasChangesRef.current = true;
    
    // Clear existing timer
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    
    // Set new auto-save timer (1.5 seconds debounce)
    autoSaveTimerRef.current = setTimeout(() => {
      if (hasChangesRef.current) {
        setSaveStatus('saving');
        onSave(nodes, edges);
        hasChangesRef.current = false;
        
        // Show "saved" status briefly
        setTimeout(() => {
          setSaveStatus('saved');
          setTimeout(() => setSaveStatus('idle'), 2000);
        }, 500);
      }
    }, 1500);
    
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [nodes, edges, onSave]);

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
    };
    return labels[type] || type;
  };

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

  const handleSave = () => {
    setSaveStatus('saving');
    onSave(nodes, edges);
    hasChangesRef.current = false;
    setTimeout(() => {
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }, 500);
  };

  return (
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
          nodes={nodes}
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
          <Controls className="!bg-card !border-border !shadow-md" />
        </ReactFlow>
      </div>

      <PropertiesPanel
        selectedNode={selectedNode}
        onUpdateNode={handleUpdateNode}
        onDeleteNode={handleDeleteNode}
        onSave={handleSave}
        triggerType={triggerType}
        triggerKeywords={triggerKeywords}
        onUpdateFlowSettings={onUpdateFlowSettings}
        allNodes={nodes}
      />
    </div>
  );
};

export const FlowCanvas = (props: FlowCanvasProps) => {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner {...props} />
    </ReactFlowProvider>
  );
};
