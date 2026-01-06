-- Create RLS policies for inbox-media bucket
CREATE POLICY "Authenticated users can upload to inbox-media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'inbox-media');

CREATE POLICY "Authenticated users can view inbox-media"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'inbox-media');

CREATE POLICY "Users can update their own inbox-media files"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'inbox-media');

CREATE POLICY "Users can delete their own inbox-media files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'inbox-media');

-- Also allow public read for flow media (images need to be public for WhatsApp)
CREATE POLICY "Public can view inbox-media"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'inbox-media');