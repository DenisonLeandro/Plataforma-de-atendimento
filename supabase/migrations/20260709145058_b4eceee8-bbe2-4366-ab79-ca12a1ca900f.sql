
-- 1) whatsapp_instance_secrets: escopar por empresa
DROP POLICY IF EXISTS "Only admins can manage secrets" ON public.whatsapp_instance_secrets;

CREATE POLICY "Admins manage secrets of their company"
ON public.whatsapp_instance_secrets
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.whatsapp_instances i
    WHERE i.id = whatsapp_instance_secrets.instance_id
      AND (
        i.company_id = public.get_user_company_id(auth.uid())
        OR public.super_admin_can_write_company(auth.uid(), i.company_id)
      )
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.whatsapp_instances i
    WHERE i.id = whatsapp_instance_secrets.instance_id
      AND (
        i.company_id = public.get_user_company_id(auth.uid())
        OR public.super_admin_can_write_company(auth.uid(), i.company_id)
      )
  )
);

-- 2) whatsapp_webhook_events: escopar por instância visível
DROP POLICY IF EXISTS "Admins and supervisors can view webhook events" ON public.whatsapp_webhook_events;

CREATE POLICY "Admins/supervisors view webhook events of their instances"
ON public.whatsapp_webhook_events
FOR SELECT
TO authenticated
USING (
  (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'supervisor'::app_role))
  AND instance_id IS NOT NULL
  AND public.can_user_see_instance(auth.uid(), instance_id)
);

-- 3) Storage whatsapp-media: escopar leitura por empresa (via instância ou uploader)
DROP POLICY IF EXISTS "Approved members can read whatsapp-media" ON storage.objects;

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
    EXISTS (
      SELECT 1 FROM public.whatsapp_instances i
      WHERE i.instance_name = (storage.foldername(name))[1]
        AND (
          i.company_id = public.get_user_company_id(auth.uid())
          OR public.super_admin_can_write_company(auth.uid(), i.company_id)
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles owner
      WHERE owner.id::text = (storage.foldername(name))[1]
        AND owner.company_id = public.get_user_company_id(auth.uid())
    )
  )
);

-- 4) Storage avatars: escopar leitura por empresa do dono do avatar
DROP POLICY IF EXISTS "Approved members can read avatars" ON storage.objects;

CREATE POLICY "Same-company members can read avatars"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'avatars'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.is_active = true AND p.is_approved = true
  )
  AND EXISTS (
    SELECT 1 FROM public.profiles owner
    WHERE owner.id::text = (storage.foldername(name))[1]
      AND owner.company_id = public.get_user_company_id(auth.uid())
  )
);
