CREATE OR REPLACE FUNCTION public.can_user_see_instance(_user_id uuid, _instance_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_super_admin(_user_id)
    OR (
      (public.has_role(_user_id, 'admin'::app_role)
       OR public.has_role(_user_id, 'supervisor'::app_role))
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