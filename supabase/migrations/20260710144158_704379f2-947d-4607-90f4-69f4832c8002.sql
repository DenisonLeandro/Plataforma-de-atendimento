
ALTER TABLE public.project_config ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE public.project_config DROP CONSTRAINT IF EXISTS project_config_key_key CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS project_config_global_key_uidx
  ON public.project_config(key) WHERE company_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS project_config_company_key_uidx
  ON public.project_config(company_id, key) WHERE company_id IS NOT NULL;

DROP POLICY IF EXISTS "Anyone can read project_config" ON public.project_config;
DROP POLICY IF EXISTS "project_config_select" ON public.project_config;
DROP POLICY IF EXISTS "project_config_write" ON public.project_config;

CREATE POLICY "project_config_select" ON public.project_config
FOR SELECT TO authenticated
USING (
  company_id IS NULL
  OR public.is_super_admin(auth.uid())
  OR company_id = public.get_user_company_id(auth.uid())
);

CREATE POLICY "project_config_write" ON public.project_config
FOR ALL TO authenticated
USING (
  (company_id IS NOT NULL AND (
    public.super_admin_can_write_company(auth.uid(), company_id)
    OR (public.has_role(auth.uid(), 'admin'::app_role)
        AND company_id = public.get_user_company_id(auth.uid()))
  ))
  OR (company_id IS NULL AND public.is_super_admin(auth.uid()))
)
WITH CHECK (
  (company_id IS NOT NULL AND (
    public.super_admin_can_write_company(auth.uid(), company_id)
    OR (public.has_role(auth.uid(), 'admin'::app_role)
        AND company_id = public.get_user_company_id(auth.uid()))
  ))
  OR (company_id IS NULL AND public.is_super_admin(auth.uid()))
);

INSERT INTO public.project_config (key, value, company_id)
SELECT 'auto_reopen_on_inbound', 'true', c.id
FROM public.companies c
ON CONFLICT DO NOTHING;

UPDATE public.project_config
SET value = 'false', updated_at = now()
WHERE key = 'auto_reopen_on_inbound'
  AND company_id = 'ab4c0aad-da5b-4200-b612-05bd8e29048b';

UPDATE public.whatsapp_conversations c
SET status = 'active', updated_at = now()
WHERE c.instance_id = '47090649-e7bb-46f4-9089-6c108d3cfb4b'
  AND c.status = 'closed'
  AND EXISTS (
    SELECT 1 FROM public.whatsapp_messages m
    WHERE m.conversation_id = c.id
      AND m.is_from_me = false
      AND m.timestamp > now() - interval '48 hours'
  );
