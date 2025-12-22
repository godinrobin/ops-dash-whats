-- Add flow_id column to blaster_campaigns to link campaigns to flows
ALTER TABLE public.blaster_campaigns 
ADD COLUMN flow_id uuid REFERENCES public.inbox_flows(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX idx_blaster_campaigns_flow_id ON public.blaster_campaigns(flow_id);