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
  }, []);

  const getNodeLabel = (type: string): string => {
    const labels: Record<string, string> = {
      start: 'Início',
      text: 'Mensagem de Texto',
      image: 'Enviar Imagem',
      audio: 'Enviar Áudio',
      video: 'Enviar Vídeo',
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
    onSave(nodes, edges);
  };

  return (
    <div className="flex w-full overflow-hidden" style={{ height: 'calc(100vh - 140px)' }}>
      <NodeSidebar />
      
      <div 
        className="flex-1 relative" 
        ref={reactFlowWrapper}
        style={{ height: '100%' }}
      >
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
