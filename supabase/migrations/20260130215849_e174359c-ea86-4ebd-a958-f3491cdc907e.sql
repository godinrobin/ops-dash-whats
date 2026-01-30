-- Enable realtime for wallet balance updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.sms_user_wallets;