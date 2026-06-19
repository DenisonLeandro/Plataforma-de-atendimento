CREATE OR REPLACE FUNCTION public.get_assignable_agents(_instance_id uuid)
 RETURNS TABLE(id uuid, full_name text, avatar_url text, status text, role app_role, active_conversations bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    p.id,
    p.full_name,
    p.avatar_url,
    p.status,
    ur.role,
    (
      SELECT count(*)
      FROM public.whatsapp_conversations c
      WHERE c.assigned_to = p.id
        AND c.status = 'active'
        AND c.instance_id = _instance_id
    ) AS active_conversations
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE p.is_active = true
    AND p.is_approved = true
    AND ur.role IN ('admin', 'supervisor', 'agent')
$function$;