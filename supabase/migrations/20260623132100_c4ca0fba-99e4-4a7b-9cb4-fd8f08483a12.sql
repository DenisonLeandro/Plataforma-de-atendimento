
CREATE OR REPLACE FUNCTION public.can_user_see_instance(_user_id uuid, _instance_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    public.has_role(_user_id, 'admin'::app_role)
    OR public.has_role(_user_id, 'supervisor'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.agent_instance_access
      WHERE user_id = _user_id AND instance_id = _instance_id
    )
$function$;
