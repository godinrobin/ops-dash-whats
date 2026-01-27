-- Create storage bucket for deliverable attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('deliverable-attachments', 'deliverable-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to their own folder
CREATE POLICY "Users can upload their own attachments"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'deliverable-attachments' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow public read access to all attachments (for use in generated HTML)
CREATE POLICY "Anyone can view deliverable attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'deliverable-attachments');

-- Allow users to delete their own attachments
CREATE POLICY "Users can delete their own attachments"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'deliverable-attachments'
  AND auth.uid()::text = (storage.foldername(name))[1]
);