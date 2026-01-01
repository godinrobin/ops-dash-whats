-- Ensure inbox_contacts table has REPLICA IDENTITY FULL for complete realtime data
ALTER TABLE public.inbox_contacts REPLICA IDENTITY FULL;

-- Ensure inbox_messages table has REPLICA IDENTITY FULL for complete realtime data  
ALTER TABLE public.inbox_messages REPLICA IDENTITY FULL;