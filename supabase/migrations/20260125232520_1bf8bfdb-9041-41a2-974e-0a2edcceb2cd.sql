-- Update RLS policies for feed tables to include semi-full members

-- Update feed_posts SELECT policy
DROP POLICY IF EXISTS "Full members can view approved posts" ON public.feed_posts;
CREATE POLICY "Members can view approved posts" 
ON public.feed_posts 
FOR SELECT 
USING (
  status = 'approved' 
  AND EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND (profiles.is_full_member = true OR profiles.is_semi_full_member = true)
  )
);

-- Update feed_comments SELECT policy
DROP POLICY IF EXISTS "Full members can view comments" ON public.feed_comments;
CREATE POLICY "Members can view comments" 
ON public.feed_comments 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM profiles 
  WHERE profiles.id = auth.uid() 
  AND (profiles.is_full_member = true OR profiles.is_semi_full_member = true)
));

-- Update feed_likes SELECT policy  
DROP POLICY IF EXISTS "Full members can view likes" ON public.feed_likes;
CREATE POLICY "Members can view likes" 
ON public.feed_likes 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM profiles 
  WHERE profiles.id = auth.uid() 
  AND (profiles.is_full_member = true OR profiles.is_semi_full_member = true)
));

-- Update feed_comment_replies SELECT policy
DROP POLICY IF EXISTS "Full members can view comment replies" ON public.feed_comment_replies;
CREATE POLICY "Members can view comment replies" 
ON public.feed_comment_replies 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM profiles 
  WHERE profiles.id = auth.uid() 
  AND (profiles.is_full_member = true OR profiles.is_semi_full_member = true)
));

-- Update feed_comment_reactions SELECT policy
DROP POLICY IF EXISTS "Full members can view comment reactions" ON public.feed_comment_reactions;
CREATE POLICY "Members can view comment reactions" 
ON public.feed_comment_reactions 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM profiles 
  WHERE profiles.id = auth.uid() 
  AND (profiles.is_full_member = true OR profiles.is_semi_full_member = true)
));