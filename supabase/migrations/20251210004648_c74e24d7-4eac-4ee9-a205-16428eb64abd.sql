-- Create storage bucket for offer images
INSERT INTO storage.buckets (id, name, public) 
VALUES ('offer-images', 'offer-images', true);

-- Allow anyone to view offer images (public bucket)
CREATE POLICY "Anyone can view offer images" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'offer-images');

-- Only admins can upload offer images
CREATE POLICY "Admins can upload offer images" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'offer-images' AND has_role(auth.uid(), 'admin'));

-- Only admins can update offer images
CREATE POLICY "Admins can update offer images" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'offer-images' AND has_role(auth.uid(), 'admin'));

-- Only admins can delete offer images
CREATE POLICY "Admins can delete offer images" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'offer-images' AND has_role(auth.uid(), 'admin'));