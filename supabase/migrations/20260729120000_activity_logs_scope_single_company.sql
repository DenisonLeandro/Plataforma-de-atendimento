-- Isolamento entre empresas no log de auditoria.
-- Cada empresa vê SÓ a sua. Super_admin vê apenas a empresa em que está
-- logado/visualizando (view-as) — nunca "todas". Reforçado no banco (RLS + RPC),
-- não apenas na tela.

-- =========================================================
-- 1) RLS: admin/super_admin só leem a PRÓPRIA empresa (base) direto na tabela.
--    Agente/supervisor continuam sem acesso. (A visão por view-as do super_admin
--    é servida pela RPC SECURITY DEFINER abaixo, que ignora a RLS.)
-- =========================================================
DROP POLICY IF EXISTS "View activity logs" ON public.activity_logs;
CREATE POLICY "View activity logs" ON public.activity_logs FOR SELECT
USING (
  (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role))
  AND company_id = public.get_user_company_id(auth.uid())
);

-- =========================================================
-- 2) RPC de leitura: escopada a UMA empresa só.
--    - admin: sempre a própria empresa (ignora o parâmetro).
--    - super_admin: a empresa passada (view-as) ou, se nula, a própria.
--    Nunca retorna várias empresas juntas.
-- =========================================================
DROP FUNCTION IF EXISTS public.get_activity_logs(uuid[], uuid, text[], timestamptz, timestamptz, integer);

CREATE OR REPLACE FUNCTION public.get_activity_logs(
  _company_id uuid DEFAULT NULL,
  _actor_user_id uuid DEFAULT NULL,
  _actions text[] DEFAULT NULL,
  _start_date timestamp with time zone DEFAULT NOW() - INTERVAL '30 days',
  _end_date timestamp with time zone DEFAULT NOW(),
  _limit integer DEFAULT 200
)
RETURNS TABLE(
  id uuid,
  actor_user_id uuid,
  actor_name text,
  actor_role text,
  company_id uuid,
  company_name text,
  action text,
  target_type text,
  target_id uuid,
  target_label text,
  metadata jsonb,
  created_at timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.id, l.actor_user_id, l.actor_name, l.actor_role,
    l.company_id, c.name AS company_name,
    l.action, l.target_type, l.target_id, l.target_label, l.metadata, l.created_at
  FROM public.activity_logs l
  LEFT JOIN public.companies c ON c.id = l.company_id
  WHERE
    -- Só admin ou super_admin acessam
    (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role))
    -- Escopo de UMA empresa: super_admin usa a passada (view-as) ou a própria;
    -- admin é sempre forçado à própria empresa.
    AND l.company_id = CASE
      WHEN public.is_super_admin(auth.uid())
        THEN COALESCE(_company_id, public.get_user_company_id(auth.uid()))
      ELSE public.get_user_company_id(auth.uid())
    END
    AND l.created_at >= _start_date
    AND l.created_at <= _end_date
    AND (_actor_user_id IS NULL OR l.actor_user_id = _actor_user_id)
    AND (_actions IS NULL OR l.action = ANY(_actions))
  ORDER BY l.created_at DESC
  LIMIT LEAST(COALESCE(_limit, 200), 1000);
$$;

REVOKE ALL ON FUNCTION public.get_activity_logs(uuid, uuid, text[], timestamptz, timestamptz, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_activity_logs(uuid, uuid, text[], timestamptz, timestamptz, integer) TO authenticated;
