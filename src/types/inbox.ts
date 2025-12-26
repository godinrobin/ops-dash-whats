export interface InboxContact {
  id: string;
  user_id: string;
  instance_id: string | null;
  phone: string;
  name: string | null;
  profile_pic_url: string | null;
  last_message_at: string | null;
  unread_count: number;
  tags: string[];
  notes: string | null;
  assigned_to: string | null;
  status: 'active' | 'archived';
  created_at: string;
  updated_at: string;
}

export interface InboxMessage {
  id: string;
  contact_id: string;
  instance_id: string | null;
  user_id: string;
  direction: 'inbound' | 'outbound';
  message_type: 'text' | 'audio' | 'image' | 'video' | 'document' | 'sticker';
  content: string | null;
  media_url: string | null;
  remote_message_id: string | null;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  is_from_flow: boolean;
  flow_id: string | null;
  created_at: string;
}

export interface InboxFlow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  nodes: FlowNode[];
  edges: FlowEdge[];
  trigger_type: 'keyword' | 'all' | 'schedule';
  trigger_keywords: string[];
  assigned_instances: string[];
  is_active: boolean;
  priority: number;
  created_at: string;
  updated_at: string;
}

export interface FlowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, any>;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface InboxFlowSession {
  id: string;
  flow_id: string;
  contact_id: string;
  instance_id: string | null;
  user_id: string;
  current_node_id: string | null;
  variables: Record<string, any>;
  status: 'active' | 'paused' | 'completed' | 'expired';
  started_at: string;
  last_interaction: string;
}

export interface InboxQuickReply {
  id: string;
  user_id: string;
  shortcut: string;
  content: string;
  attachments: any[];
  created_at: string;
}

export interface InboxTag {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
}

export type NodeType = 
  | 'start'
  | 'text'
  | 'image'
  | 'audio'
  | 'video'
  | 'delay'
  | 'waitInput'
  | 'condition'
  | 'menu'
  | 'ai'
  | 'transfer'
  | 'webhook'
  | 'setVariable'
  | 'tag'
  | 'randomizer'
  | 'end';
