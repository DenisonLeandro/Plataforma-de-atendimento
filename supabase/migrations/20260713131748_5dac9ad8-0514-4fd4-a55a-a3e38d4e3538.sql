DROP POLICY IF EXISTS "Same-company members can read whatsapp-media" ON storage.objects;

CREATE POLICY "Same-company members can read whatsapp-media"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'whatsapp-media'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.is_active = true AND p.is_approved = true
  )
  AND EXISTS (
    SELECT 1 FROM public.whatsapp_instances i
    WHERE i.instance_name = (storage.foldername(objects.name))[1]
      AND (
        i.company_id = public.get_user_company_id(auth.uid())
        OR public.super_admin_can_write_company(auth.uid(), i.company_id)
      )
  )
);