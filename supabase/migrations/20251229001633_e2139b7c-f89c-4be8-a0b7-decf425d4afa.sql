-- Create table to track flow node analytics (conversions)
CREATE TABLE public.inbox_flow_analytics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  flow_id UUID NOT NULL REFERENCES public.inbox_flows(id) ON DELETE CASCADE,
  session_id UUID NOT NULL,
  node_id TEXT NOT NULL,
  node_type TEXT NOT NULL,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.inbox_flow_analytics ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own flow analytics"
ON public.inbox_flow_analytics
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own flow analytics"
ON public.inbox_flow_analytics
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Create index for efficient queries
CREATE INDEX idx_flow_analytics_flow_id ON public.inbox_flow_analytics(flow_id);
CREATE INDEX idx_flow_analytics_created_at ON public.inbox_flow_analytics(created_at);
CREATE INDEX idx_flow_analytics_node_id ON public.inbox_flow_analytics(flow_id, node_id);
CREATE INDEX idx_flow_analytics_session ON public.inbox_flow_analytics(session_id);

-- Allow service role to insert analytics from edge functions
CREATE POLICY "Service role can manage flow analytics"
ON public.inbox_flow_analytics
FOR ALL
USING (true)
WITH CHECK (true);

-- Enable realtime for analytics updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.inbox_flow_analytics;