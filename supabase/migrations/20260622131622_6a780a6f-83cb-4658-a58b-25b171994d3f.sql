CREATE POLICY "Users can update their own whatsapp-media files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'whatsapp-media'
  AND auth.uid()::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'whatsapp-media'
  AND auth.uid()::text = (storage.foldername(name))[1]
);