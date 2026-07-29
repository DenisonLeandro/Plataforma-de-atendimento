
-- 1) DELETE policy for whatsapp_contacts (admins/supervisors within company, super admins cross-company)
CREATE POLICY "Admins and supervisors can delete contacts"
ON public.whatsapp_contacts
FOR DELETE
TO authenticated
USING (
  public.super_admin_can_write_company(auth.uid(), company_id)
  OR (
    (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'supervisor'::app_role))
    AND company_id = public.get_user_company_id(auth.uid())
  )
);

-- 2) Tighten whatsapp-media SELECT policy to eliminate folder-name ambiguity
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
  AND (
    -- Instance-name folder: must be an instance in the caller's company (or super admin exception)
    EXISTS (
      SELECT 1 FROM public.whatsapp_instances i
      WHERE (i.instance_name)::text = (storage.foldername(objects.name))[1]
        AND (
          i.company_id = public.get_user_company_id(auth.uid())
          OR public.super_admin_can_write_company(auth.uid(), i.company_id)
        )
    )
    -- User-id folder: only the owning user may read their own uploads
    OR (
      (storage.foldername(objects.name))[1] = (auth.uid())::text
      AND objects.owner = auth.uid()
    )
  )
);
