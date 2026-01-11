-- Add reaction column to feed_likes table to store emoji reactions
ALTER TABLE public.feed_likes 
ADD COLUMN reaction TEXT NOT NULL DEFAULT '🔥';