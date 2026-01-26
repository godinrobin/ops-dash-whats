-- Create table to store group messages (cached from WhatsApp API)
CREATE TABLE public.inbox_group_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  instance_id UUID REFERENCES public.maturador_instances(id) ON DELETE CASCADE,
  group_jid TEXT NOT NULL,
  sender_jid TEXT NOT NULL,
  sender_name TEXT,
  sender_push_name TEXT,
  message_id TEXT NOT NULL,
  content TEXT,
  message_type TEXT NOT NULL DEFAULT 'text',
  media_url TEXT,
  media_mimetype TEXT,
  is_from_me BOOLEAN NOT NULL DEFAULT false,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Unique constraint to avoid duplicates
  CONSTRAINT inbox_group_messages_unique UNIQUE (instance_id, group_jid, message_id)
);

-- Enable RLS
ALTER TABLE public.inbox_group_messages ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own group messages" 
ON public.inbox_group_messages 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own group messages" 
ON public.inbox_group_messages 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can manage all group messages"
ON public.inbox_group_messages 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Index for faster queries
CREATE INDEX idx_inbox_group_messages_group ON public.inbox_group_messages (user_id, group_jid, timestamp DESC);
CREATE INDEX idx_inbox_group_messages_instance ON public.inbox_group_messages (instance_id);

-- Enable realtime for group messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.inbox_group_messages;

-- Create table to cache group metadata
CREATE TABLE public.inbox_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  instance_id UUID REFERENCES public.maturador_instances(id) ON DELETE CASCADE,
  group_jid TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  profile_pic_url TEXT,
  owner_jid TEXT,
  participant_count INTEGER DEFAULT 0,
  is_announce BOOLEAN DEFAULT false,
  is_community BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_message_at TIMESTAMP WITH TIME ZONE,
  last_message_preview TEXT,
  unread_count INTEGER DEFAULT 0,
  
  -- Unique constraint
  CONSTRAINT inbox_groups_unique UNIQUE (instance_id, group_jid)
);

-- Enable RLS
ALTER TABLE public.inbox_groups ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own groups" 
ON public.inbox_groups 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own groups" 
ON public.inbox_groups 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own groups" 
ON public.inbox_groups 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own groups" 
ON public.inbox_groups 
FOR DELETE 
USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all groups"
ON public.inbox_groups 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Index for faster queries
CREATE INDEX idx_inbox_groups_user ON public.inbox_groups (user_id, last_message_at DESC NULLS LAST);
CREATE INDEX idx_inbox_groups_instance ON public.inbox_groups (instance_id);

-- Enable realtime for groups
ALTER PUBLICATION supabase_realtime ADD TABLE public.inbox_groups;