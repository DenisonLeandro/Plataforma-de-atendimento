CREATE OR REPLACE FUNCTION public.get_assignable_agents(_instance_id uuid)
RETURNS TABLE(id uuid, full_name text, avatar_url text, status text, role app_role, active_conversations bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH inst AS (
    SELECT company_id FROM public.whatsapp_instances WHERE id = _instance_id
  )
  SELECT
    p.id,
    COALESCE(p.display_name, p.full_name) AS full_name,
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
    AND (
      -- Mesma empresa da instância
      p.company_id = (SELECT company_id FROM inst)
      -- OU super admin com exceção explícita para a empresa da instância
      OR (
        ur.role = 'admin'
        AND EXISTS (
          SELECT 1
          FROM public.user_roles sur
          JOIN public.super_admin_company_access saca
            ON saca.super_admin_id = sur.user_id
          WHERE sur.user_id = p.id
            AND sur.role = 'super_admin'
            AND saca.company_id = (SELECT company_id FROM inst)
        )
      )
      OR EXISTS (
        SELECT 1
        FROM public.user_roles sur
        JOIN public.super_admin_company_access saca
          ON saca.super_admin_id = sur.user_id
        WHERE sur.user_id = p.id
          AND sur.role = 'super_admin'
          AND saca.company_id = (SELECT company_id FROM inst)
      )
    );
$function$;