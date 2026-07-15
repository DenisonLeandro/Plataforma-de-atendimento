DROP POLICY IF EXISTS "Only admins can manage project config" ON public.project_config;

DROP POLICY IF EXISTS "Admins manage secrets of their company" ON public.whatsapp_instance_secrets;

CREATE POLICY "Admins write secrets of their company"
ON public.whatsapp_instance_secrets
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) AND EXISTS (
    SELECT 1 FROM public.whatsapp_instances i
    WHERE i.id = whatsapp_instance_secrets.instance_id
      AND (i.company_id = get_user_company_id(auth.uid())
           OR super_admin_can_write_company(auth.uid(), i.company_id))
  )
);

CREATE POLICY "Admins update secrets of their company"
ON public.whatsapp_instance_secrets
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) AND EXISTS (
    SELECT 1 FROM public.whatsapp_instances i
    WHERE i.id = whatsapp_instance_secrets.instance_id
      AND (i.company_id = get_user_company_id(auth.uid())
           OR super_admin_can_write_company(auth.uid(), i.company_id))
  )
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) AND EXISTS (
    SELECT 1 FROM public.whatsapp_instances i
    WHERE i.id = whatsapp_instance_secrets.instance_id
      AND (i.company_id = get_user_company_id(auth.uid())
           OR super_admin_can_write_company(auth.uid(), i.company_id))
  )
);

CREATE POLICY "Admins delete secrets of their company"
ON public.whatsapp_instance_secrets
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) AND EXISTS (
    SELECT 1 FROM public.whatsapp_instances i
    WHERE i.id = whatsapp_instance_secrets.instance_id
      AND (i.company_id = get_user_company_id(auth.uid())
           OR super_admin_can_write_company(auth.uid(), i.company_id))
  )
);