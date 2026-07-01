
-- =========================================================
-- FASE 1: MULTI-TENANT — SCHEMA + BACKFILL
-- =========================================================

-- 1) Tabela companies
CREATE TABLE IF NOT EXISTS public.companies (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at timestamp with time zone DEFAULT now()
);

GRANT SELECT ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- 2) company_id em todas as tabelas (nullable)
ALTER TABLE public.profiles                ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.user_roles              ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.whatsapp_instances      ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.whatsapp_contacts       ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.whatsapp_conversations  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.whatsapp_messages       ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.whatsapp_macros         ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.assignment_rules        ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.agent_instance_access   ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.conversation_assignments ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

-- 3) Criar empresa Denison Leandro e backfill
INSERT INTO public.companies (id, name, code, status)
VALUES ('00000000-0000-0000-0000-000000000001', 'Denison Leandro Advocacia', 'DLA001', 'active')
ON CONFLICT (id) DO NOTHING;

UPDATE public.profiles                SET company_id='00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
UPDATE public.user_roles              SET company_id='00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
UPDATE public.whatsapp_instances      SET company_id='00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
UPDATE public.whatsapp_contacts       SET company_id='00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
UPDATE public.whatsapp_conversations  SET company_id='00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
UPDATE public.whatsapp_messages       SET company_id='00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
UPDATE public.whatsapp_macros         SET company_id='00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
UPDATE public.assignment_rules        SET company_id='00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
UPDATE public.agent_instance_access   SET company_id='00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
UPDATE public.conversation_assignments SET company_id='00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;

-- 4) Role super_admin para Denison
INSERT INTO public.user_roles (user_id, role, company_id)
VALUES ('1ce45272-1241-4829-9435-6d841b959353', 'super_admin'::app_role, '00000000-0000-0000-0000-000000000001')
ON CONFLICT (user_id, role) DO NOTHING;

-- 5) Funções auxiliares
CREATE OR REPLACE FUNCTION public.get_user_company_id(_user_id uuid DEFAULT auth.uid())
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$ SELECT company_id FROM public.profiles WHERE id = _user_id; $$;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'super_admin'::app_role
  );
$$;

CREATE OR REPLACE FUNCTION public.generate_company_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_code text;
  code_exists boolean;
BEGIN
  LOOP
    new_code := upper(substr(md5(random()::text), 1, 6));
    SELECT EXISTS (SELECT 1 FROM public.companies WHERE code = new_code) INTO code_exists;
    IF NOT code_exists THEN RETURN new_code; END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.get_user_company_id(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_super_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.generate_company_code() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_company_id(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_company_code() TO service_role;

-- 6) can_user_see_instance (super_admin + admin-por-empresa + agent_instance_access)
CREATE OR REPLACE FUNCTION public.can_user_see_instance(_user_id uuid, _instance_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_super_admin(_user_id)
    OR (
      public.has_role(_user_id, 'admin'::app_role)
      AND EXISTS (
        SELECT 1 FROM public.whatsapp_instances i
        WHERE i.id = _instance_id
          AND i.company_id = public.get_user_company_id(_user_id)
      )
    )
    OR EXISTS (
      SELECT 1 FROM public.agent_instance_access a
      WHERE a.user_id = _user_id AND a.instance_id = _instance_id
    );
$$;

-- 7) RLS de companies
DROP POLICY IF EXISTS "Super admins can view all companies" ON public.companies;
CREATE POLICY "Super admins can view all companies" ON public.companies FOR SELECT
  USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Users can view own company" ON public.companies;
CREATE POLICY "Users can view own company" ON public.companies FOR SELECT
  USING (id = public.get_user_company_id(auth.uid()));

DROP POLICY IF EXISTS "Super admins can manage companies" ON public.companies;
CREATE POLICY "Super admins can manage companies" ON public.companies FOR ALL
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- 8) profiles
DROP POLICY IF EXISTS "Admins and supervisors can view all profiles" ON public.profiles;
CREATE POLICY "Admins and supervisors can view all profiles" ON public.profiles FOR SELECT
  USING (
    public.is_super_admin(auth.uid())
    OR (
      (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'supervisor'::app_role))
      AND company_id = public.get_user_company_id(auth.uid())
    )
  );

DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
CREATE POLICY "Admins can update any profile" ON public.profiles FOR UPDATE
  USING (
    public.is_super_admin(auth.uid())
    OR (public.has_role(auth.uid(),'admin'::app_role) AND company_id = public.get_user_company_id(auth.uid()))
  );

-- 9) user_roles
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT
  USING (
    public.is_super_admin(auth.uid())
    OR (public.has_role(auth.uid(),'admin'::app_role) AND company_id = public.get_user_company_id(auth.uid()))
  );

DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL
  USING (
    public.is_super_admin(auth.uid())
    OR (public.has_role(auth.uid(),'admin'::app_role) AND company_id = public.get_user_company_id(auth.uid()))
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (public.has_role(auth.uid(),'admin'::app_role) AND company_id = public.get_user_company_id(auth.uid()))
  );

-- 10) whatsapp_instances
DROP POLICY IF EXISTS "Only admins can manage instances" ON public.whatsapp_instances;
CREATE POLICY "Only admins can manage instances" ON public.whatsapp_instances FOR ALL
  USING (
    public.is_super_admin(auth.uid())
    OR (public.has_role(auth.uid(),'admin'::app_role) AND company_id = public.get_user_company_id(auth.uid()))
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (public.has_role(auth.uid(),'admin'::app_role) AND company_id = public.get_user_company_id(auth.uid()))
  );

-- 11) whatsapp_contacts
DROP POLICY IF EXISTS "Admins and supervisors can view all contacts" ON public.whatsapp_contacts;
CREATE POLICY "Admins and supervisors can view company contacts" ON public.whatsapp_contacts FOR SELECT
  USING (
    public.is_super_admin(auth.uid())
    OR (
      (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'supervisor'::app_role))
      AND company_id = public.get_user_company_id(auth.uid())
    )
  );

-- 12) whatsapp_conversations INSERT
DROP POLICY IF EXISTS "Service can insert conversations" ON public.whatsapp_conversations;
CREATE POLICY "Service can insert conversations" ON public.whatsapp_conversations FOR INSERT
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'supervisor'::app_role))
      AND company_id = public.get_user_company_id(auth.uid())
    )
  );

-- 13) whatsapp_macros — substituir policies
DROP POLICY IF EXISTS "Authenticated users can view macros" ON public.whatsapp_macros;
DROP POLICY IF EXISTS "Supervisors can manage macros" ON public.whatsapp_macros;
CREATE POLICY "Users can view company macros" ON public.whatsapp_macros FOR SELECT
  USING (
    public.is_super_admin(auth.uid())
    OR company_id = public.get_user_company_id(auth.uid())
  );
CREATE POLICY "Admins and supervisors can manage company macros" ON public.whatsapp_macros FOR ALL
  USING (
    public.is_super_admin(auth.uid())
    OR (
      (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'supervisor'::app_role))
      AND company_id = public.get_user_company_id(auth.uid())
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'supervisor'::app_role))
      AND company_id = public.get_user_company_id(auth.uid())
    )
  );

-- 14) assignment_rules — substituir policies
DROP POLICY IF EXISTS "Admins and supervisors can view rules" ON public.assignment_rules;
DROP POLICY IF EXISTS "Admins and supervisors can manage rules" ON public.assignment_rules;
CREATE POLICY "Users can view company rules" ON public.assignment_rules FOR SELECT
  USING (
    public.is_super_admin(auth.uid())
    OR company_id = public.get_user_company_id(auth.uid())
  );
CREATE POLICY "Admins and supervisors can manage company rules" ON public.assignment_rules FOR ALL
  USING (
    public.is_super_admin(auth.uid())
    OR (
      (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'supervisor'::app_role))
      AND company_id = public.get_user_company_id(auth.uid())
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'supervisor'::app_role))
      AND company_id = public.get_user_company_id(auth.uid())
    )
  );

-- 15) agent_instance_access
DROP POLICY IF EXISTS "Admins manage instance access" ON public.agent_instance_access;
CREATE POLICY "Admins manage instance access" ON public.agent_instance_access FOR ALL
  USING (
    public.is_super_admin(auth.uid())
    OR (public.has_role(auth.uid(),'admin'::app_role) AND company_id = public.get_user_company_id(auth.uid()))
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (public.has_role(auth.uid(),'admin'::app_role) AND company_id = public.get_user_company_id(auth.uid()))
  );

-- 16) conversation_assignments
DROP POLICY IF EXISTS "Users can view assignments of accessible conversations" ON public.conversation_assignments;
CREATE POLICY "Users can view company assignments" ON public.conversation_assignments FOR SELECT
  USING (
    public.is_super_admin(auth.uid())
    OR company_id = public.get_user_company_id(auth.uid())
  );

DROP POLICY IF EXISTS "Users can insert assignments for accessible conversations" ON public.conversation_assignments;
CREATE POLICY "Admins and supervisors can manage company assignments" ON public.conversation_assignments FOR INSERT
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'supervisor'::app_role))
      AND company_id = public.get_user_company_id(auth.uid())
    )
  );

-- 17) get_conversation_counters
CREATE OR REPLACE FUNCTION public.get_conversation_counters(
  _instance_id uuid DEFAULT NULL::uuid,
  _status text DEFAULT NULL::text,
  _status_in text[] DEFAULT NULL::text[],
  _assigned_to uuid DEFAULT NULL::uuid,
  _unassigned boolean DEFAULT false
)
RETURNS TABLE(unread_count bigint, waiting_count bigint, total_count bigint)
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
  SELECT
    COUNT(*) FILTER (
      WHERE c.unread_count > 0
        AND (c.status IS NULL OR c.status NOT IN ('closed','archived'))
    )::bigint AS unread_count,
    COUNT(*) FILTER (
      WHERE c.last_message_is_from_me = false
        AND (c.status IS NULL OR c.status NOT IN ('closed','archived'))
    )::bigint AS waiting_count,
    COUNT(*)::bigint AS total_count
  FROM public.whatsapp_conversations c
  WHERE public.can_user_see_instance(auth.uid(), c.instance_id)
    AND (public.is_super_admin(auth.uid()) OR c.company_id = public.get_user_company_id(auth.uid()))
    AND (_instance_id IS NULL OR c.instance_id = _instance_id)
    AND (_status IS NULL OR c.status = _status)
    AND (_status_in IS NULL OR c.status = ANY(_status_in))
    AND (_assigned_to IS NULL OR c.assigned_to = _assigned_to)
    AND (NOT _unassigned OR c.assigned_to IS NULL);
$$;

-- 18) handle_new_user com company_id do metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _is_first_user boolean;
  _assigned_role app_role;
  _require_approval boolean;
  _is_approved boolean;
  _company_id uuid;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO _is_first_user;

  SELECT (value = 'true') INTO _require_approval
  FROM public.project_config
  WHERE key = 'require_account_approval'
  LIMIT 1;
  _require_approval := COALESCE(_require_approval, false);

  IF _is_first_user THEN
    _assigned_role := 'admin';
    _is_approved := true;
  ELSE
    _assigned_role := 'agent';
    _is_approved := NOT _require_approval;
  END IF;

  BEGIN
    _company_id := NULLIF(new.raw_user_meta_data->>'company_id','')::uuid;
  EXCEPTION WHEN others THEN
    _company_id := NULL;
  END;

  INSERT INTO public.profiles (id, full_name, email, is_active, is_approved, company_id)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
    new.email,
    true,
    _is_approved,
    _company_id
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role, company_id)
  VALUES (new.id, _assigned_role, _company_id)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN new;
END;
$function$;

-- 19) Índices
CREATE INDEX IF NOT EXISTS idx_profiles_company_id ON public.profiles(company_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_company_id ON public.user_roles(company_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_company_id ON public.whatsapp_instances(company_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_company_id ON public.whatsapp_contacts(company_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_company_id ON public.whatsapp_conversations(company_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_company_id ON public.whatsapp_messages(company_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_macros_company_id ON public.whatsapp_macros(company_id);
CREATE INDEX IF NOT EXISTS idx_assignment_rules_company_id ON public.assignment_rules(company_id);
CREATE INDEX IF NOT EXISTS idx_companies_code ON public.companies(code);
