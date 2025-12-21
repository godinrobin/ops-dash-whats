-- Create inbox_tags table
CREATE TABLE public.inbox_tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create inbox_contacts table
CREATE TABLE public.inbox_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  instance_id UUID REFERENCES public.maturador_instances(id) ON DELETE SET NULL,
  phone TEXT NOT NULL,
  name TEXT,
  profile_pic_url TEXT,
  last_message_at TIMESTAMP WITH TIME ZONE,
  unread_count INTEGER NOT NULL DEFAULT 0,
  tags JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  assigned_to UUID,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create inbox_messages table
CREATE TABLE public.inbox_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES public.inbox_contacts(id) ON DELETE CASCADE,
  instance_id UUID REFERENCES public.maturador_instances(id) ON DELETE SET NULL,
  user_id UUID NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_type TEXT NOT NULL DEFAULT 'text',
  content TEXT,
  media_url TEXT,
  remote_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  is_from_flow BOOLEAN NOT NULL DEFAULT false,
  flow_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create inbox_flows table
CREATE TABLE public.inbox_flows (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  nodes JSONB NOT NULL DEFAULT '[]'::jsonb,
  edges JSONB NOT NULL DEFAULT '[]'::jsonb,
  trigger_type TEXT NOT NULL DEFAULT 'keyword',
  trigger_keywords TEXT[] DEFAULT '{}',
  assigned_instances UUID[] DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT false,
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create inbox_flow_sessions table
CREATE TABLE public.inbox_flow_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  flow_id UUID NOT NULL REFERENCES public.inbox_flows(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.inbox_contacts(id) ON DELETE CASCADE,
  instance_id UUID REFERENCES public.maturador_instances(id) ON DELETE SET NULL,
  user_id UUID NOT NULL,
  current_node_id TEXT,
  variables JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active',
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_interaction TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create inbox_quick_replies table
CREATE TABLE public.inbox_quick_replies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  shortcut TEXT NOT NULL,
  content TEXT NOT NULL,
  attachments JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.inbox_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_flow_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_quick_replies ENABLE ROW LEVEL SECURITY;

-- RLS policies for inbox_tags
CREATE POLICY "Users can manage their own tags" ON public.inbox_tags FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- RLS policies for inbox_contacts
CREATE POLICY "Users can view their own contacts" ON public.inbox_contacts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own contacts" ON public.inbox_contacts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own contacts" ON public.inbox_contacts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own contacts" ON public.inbox_contacts FOR DELETE USING (auth.uid() = user_id);

-- RLS policies for inbox_messages
CREATE POLICY "Users can view their own messages" ON public.inbox_messages FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own messages" ON public.inbox_messages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own messages" ON public.inbox_messages FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own messages" ON public.inbox_messages FOR DELETE USING (auth.uid() = user_id);

-- RLS policies for inbox_flows
CREATE POLICY "Users can manage their own flows" ON public.inbox_flows FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- RLS policies for inbox_flow_sessions
CREATE POLICY "Users can manage their own flow sessions" ON public.inbox_flow_sessions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- RLS policies for inbox_quick_replies
CREATE POLICY "Users can manage their own quick replies" ON public.inbox_quick_replies FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Enable realtime for inbox_messages and inbox_contacts
ALTER PUBLICATION supabase_realtime ADD TABLE public.inbox_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.inbox_contacts;

-- Create indexes for performance
CREATE INDEX idx_inbox_contacts_user_id ON public.inbox_contacts(user_id);
CREATE INDEX idx_inbox_contacts_phone ON public.inbox_contacts(phone);
CREATE INDEX idx_inbox_contacts_last_message ON public.inbox_contacts(last_message_at DESC);
CREATE INDEX idx_inbox_messages_contact_id ON public.inbox_messages(contact_id);
CREATE INDEX idx_inbox_messages_created_at ON public.inbox_messages(created_at DESC);
CREATE INDEX idx_inbox_flow_sessions_contact ON public.inbox_flow_sessions(contact_id);
CREATE INDEX idx_inbox_flow_sessions_status ON public.inbox_flow_sessions(status);