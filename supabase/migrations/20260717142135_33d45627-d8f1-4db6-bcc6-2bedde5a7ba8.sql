DROP POLICY IF EXISTS "Same-company members can read whatsapp-media" ON storage.objects;

CREATE POLICY "Same-company members can read whatsapp-media"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'whatsapp-media'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.is_active = true
      AND p.is_approved = true
  )
  AND (
    -- A. Prefixo por instância (mídia baixada pelo webhook/backfill):
    -- primeira pasta = instance_name de uma instância da mesma empresa
    -- (ou super admin com acesso explícito àquela empresa).
    EXISTS (
      SELECT 1 FROM public.whatsapp_instances i
      WHERE i.instance_name = (storage.foldername(objects.name))[1]
        AND (
          i.company_id = public.get_user_company_id(auth.uid())
          OR public.super_admin_can_write_company(auth.uid(), i.company_id)
        )
    )
    -- B. Prefixo por usuário (upload manual pelo composer):
    -- primeira pasta = auth.uid() de um profile ativo/aprovado da mesma empresa
    -- (ou super admin com acesso explícito àquela empresa).
    OR EXISTS (
      SELECT 1 FROM public.profiles up
      WHERE up.id::text = (storage.foldername(objects.name))[1]
        AND up.is_active = true
        AND up.is_approved = true
        AND (
          up.company_id = public.get_user_company_id(auth.uid())
          OR public.super_admin_can_write_company(auth.uid(), up.company_id)
        )
    )
  )
);