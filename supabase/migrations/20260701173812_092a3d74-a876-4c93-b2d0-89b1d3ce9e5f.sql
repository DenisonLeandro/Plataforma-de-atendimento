
-- 1. Tabela de exceções
CREATE TABLE IF NOT EXISTS public.super_admin_company_access (
  super_admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  PRIMARY KEY (super_admin_id, company_id)
);

GRANT SELECT ON public.super_admin_company_access TO authenticated;
GRANT ALL ON public.super_admin_company_access TO service_role;

ALTER TABLE public.super_admin_company_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin can read own exceptions"
  ON public.super_admin_company_access FOR SELECT
  USING (public.is_super_admin(auth.uid()) AND super_admin_id = auth.uid());

-- 2. Função auxiliar
CREATE OR REPLACE FUNCTION public.super_admin_can_write_company(_uid uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _company_id IS NOT NULL
    AND public.is_super_admin(_uid)
    AND EXISTS (
      SELECT 1 FROM public.super_admin_company_access
      WHERE super_admin_id = _uid AND company_id = _company_id
    );
$$;

-- 3. Seed: Denison em Piscinas Ibiporã
INSERT INTO public.super_admin_company_access (super_admin_id, company_id)
SELECT ur.user_id, 'ab4c0aad-da5b-4200-b612-05bd8e29048b'::uuid
FROM public.user_roles ur
WHERE ur.role = 'super_admin'::app_role
ON CONFLICT DO NOTHING;

-- 4. can_access_conversation: adicionar exceção do super admin
CREATE OR REPLACE FUNCTION public.can_access_conversation(_user_id uuid, _conversation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE PARALLEL SAFE SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _is_active_approved boolean;
  _is_admin boolean;
  _is_supervisor boolean;
  _assigned_to uuid;
  _instance_id uuid;
  _company_id uuid;
BEGIN
  SELECT (p.is_active AND p.is_approved) INTO _is_active_approved
  FROM public.profiles p WHERE p.id = _user_id;
  IF NOT COALESCE(_is_active_approved, false) THEN RETURN false; END IF;

  SELECT c.assigned_to, c.instance_id, c.company_id
    INTO _assigned_to, _instance_id, _company_id
  FROM public.whatsapp_conversations c WHERE c.id = _conversation_id;
  IF _instance_id IS NULL THEN RETURN false; END IF;

  -- Super admin com exceção explícita para a empresa: acesso pleno
  IF public.super_admin_can_write_company(_user_id, _company_id) THEN
    RETURN true;
  END IF;

  IF _assigned_to = _user_id THEN RETURN true; END IF;

  _is_admin := public.has_role(_user_id, 'admin'::app_role);
  _is_supervisor := public.has_role(_user_id, 'supervisor'::app_role);

  IF _is_admin OR _is_supervisor THEN
    RETURN public.can_user_see_instance(_user_id, _instance_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.agent_instance_access
    WHERE user_id = _user_id AND instance_id = _instance_id
  ) THEN RETURN false; END IF;

  IF _assigned_to IS NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM public.assignment_rules r
      WHERE r.instance_id = _instance_id AND r.is_active = true
        AND (
          (r.rule_type = 'fixed' AND r.fixed_agent_id = _user_id)
          OR (r.rule_type = 'round_robin' AND _user_id = ANY(r.round_robin_agents))
        )
    );
  END IF;

  RETURN false;
END;
$function$;

-- 5. whatsapp_conversations INSERT/UPDATE: trocar is_super_admin blanket por regra explícita
DROP POLICY IF EXISTS "Service can insert conversations" ON public.whatsapp_conversations;
CREATE POLICY "Service can insert conversations"
  ON public.whatsapp_conversations FOR INSERT
  WITH CHECK (
    public.super_admin_can_write_company(auth.uid(), company_id)
    OR (
      (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'supervisor'::app_role))
      AND company_id = public.get_user_company_id(auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can update accessible conversations" ON public.whatsapp_conversations;
CREATE POLICY "Users can update accessible conversations"
  ON public.whatsapp_conversations FOR UPDATE
  USING (auth.uid() IS NOT NULL AND public.can_access_conversation(auth.uid(), id))
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND public.can_access_conversation(auth.uid(), id)
    AND (
      public.super_admin_can_write_company(auth.uid(), company_id)
      OR company_id = public.get_user_company_id(auth.uid())
    )
  );

-- 6. whatsapp_instances: gerenciamento restrito por empresa (com exceção do super admin)
DROP POLICY IF EXISTS "Only admins can manage instances" ON public.whatsapp_instances;
CREATE POLICY "Only admins can manage instances"
  ON public.whatsapp_instances FOR ALL
  USING (
    public.super_admin_can_write_company(auth.uid(), company_id)
    OR (public.has_role(auth.uid(), 'admin'::app_role) AND company_id = public.get_user_company_id(auth.uid()))
  )
  WITH CHECK (
    public.super_admin_can_write_company(auth.uid(), company_id)
    OR (public.has_role(auth.uid(), 'admin'::app_role) AND company_id = public.get_user_company_id(auth.uid()))
  );

-- 7. whatsapp_contacts "Supervisors can manage contacts": restringir por empresa
DROP POLICY IF EXISTS "Supervisors can manage contacts" ON public.whatsapp_contacts;
CREATE POLICY "Supervisors can manage contacts"
  ON public.whatsapp_contacts FOR ALL
  USING (
    public.super_admin_can_write_company(auth.uid(), company_id)
    OR (
      (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'supervisor'::app_role))
      AND company_id = public.get_user_company_id(auth.uid())
    )
  )
  WITH CHECK (
    public.super_admin_can_write_company(auth.uid(), company_id)
    OR (
      (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'supervisor'::app_role))
      AND company_id = public.get_user_company_id(auth.uid())
    )
  );
