
-- Índices de suporte
CREATE INDEX IF NOT EXISTS idx_assignment_rules_instance_active
  ON public.assignment_rules (instance_id) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_agent_instance_access_user_instance
  ON public.agent_instance_access (user_id, instance_id);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_role
  ON public.user_roles (user_id, role);

-- Reescreve can_access_conversation com curto-circuito
CREATE OR REPLACE FUNCTION public.can_access_conversation(_user_id uuid, _conversation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
PARALLEL SAFE
SET search_path = public
AS $$
DECLARE
  _is_active_approved boolean;
  _is_admin boolean;
  _is_supervisor boolean;
  _assigned_to uuid;
  _instance_id uuid;
BEGIN
  SELECT (p.is_active AND p.is_approved)
    INTO _is_active_approved
  FROM public.profiles p
  WHERE p.id = _user_id;

  IF NOT COALESCE(_is_active_approved, false) THEN
    RETURN false;
  END IF;

  SELECT c.assigned_to, c.instance_id
    INTO _assigned_to, _instance_id
  FROM public.whatsapp_conversations c
  WHERE c.id = _conversation_id;

  IF _instance_id IS NULL THEN
    RETURN false;
  END IF;

  -- Caso 1: já é o dono
  IF _assigned_to = _user_id THEN
    RETURN true;
  END IF;

  _is_admin := public.has_role(_user_id, 'admin'::app_role);
  _is_supervisor := public.has_role(_user_id, 'supervisor'::app_role);

  -- Sem acesso à instância → não pode
  IF NOT (_is_admin OR _is_supervisor OR EXISTS (
    SELECT 1 FROM public.agent_instance_access
    WHERE user_id = _user_id AND instance_id = _instance_id
  )) THEN
    RETURN false;
  END IF;

  -- Admin/supervisor com acesso à instância → pode
  IF _is_admin OR _is_supervisor THEN
    RETURN true;
  END IF;

  -- Agente com acesso à instância só vê conversas não atribuídas
  -- e que não estejam reservadas para outro agente via assignment_rules.
  IF _assigned_to IS NULL THEN
    RETURN NOT EXISTS (
      SELECT 1 FROM public.assignment_rules r
      WHERE r.instance_id = _instance_id
        AND r.is_active = true
        AND NOT (
          (r.rule_type = 'fixed' AND r.fixed_agent_id = _user_id)
          OR (r.rule_type = 'round_robin' AND _user_id = ANY(r.round_robin_agents))
        )
    );
  END IF;

  RETURN false;
END;
$$;

-- Reescreve can_view_conversation com curto-circuito
CREATE OR REPLACE FUNCTION public.can_view_conversation(_user_id uuid, _conversation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
PARALLEL SAFE
SET search_path = public
AS $$
DECLARE
  _is_active_approved boolean;
  _assigned_to uuid;
  _instance_id uuid;
BEGIN
  -- Se já tem acesso de escrita, tem leitura
  IF public.can_access_conversation(_user_id, _conversation_id) THEN
    RETURN true;
  END IF;

  SELECT (p.is_active AND p.is_approved)
    INTO _is_active_approved
  FROM public.profiles p
  WHERE p.id = _user_id;

  IF NOT COALESCE(_is_active_approved, false) THEN
    RETURN false;
  END IF;

  SELECT c.assigned_to, c.instance_id
    INTO _assigned_to, _instance_id
  FROM public.whatsapp_conversations c
  WHERE c.id = _conversation_id;

  -- Peer da mesma instância vê conversas já atribuídas (read-only)
  IF _assigned_to IS NOT NULL AND _instance_id IS NOT NULL
     AND public.can_user_see_instance(_user_id, _instance_id) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

-- RPC consolidada para contadores (não lidas + aguardando) em uma única chamada
CREATE OR REPLACE FUNCTION public.get_conversation_counters(
  _instance_id uuid DEFAULT NULL,
  _status text DEFAULT NULL,
  _status_in text[] DEFAULT NULL,
  _assigned_to uuid DEFAULT NULL,
  _unassigned boolean DEFAULT false
)
RETURNS TABLE(unread_count bigint, waiting_count bigint, total_count bigint)
LANGUAGE sql
STABLE SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    COUNT(*) FILTER (WHERE unread_count > 0)::bigint AS unread_count,
    COUNT(*) FILTER (WHERE last_message_is_from_me = false)::bigint AS waiting_count,
    COUNT(*)::bigint AS total_count
  FROM public.whatsapp_conversations c
  WHERE (_instance_id IS NULL OR c.instance_id = _instance_id)
    AND (_status IS NULL OR c.status = _status)
    AND (_status_in IS NULL OR c.status = ANY(_status_in))
    AND (_assigned_to IS NULL OR c.assigned_to = _assigned_to)
    AND (NOT _unassigned OR c.assigned_to IS NULL);
$$;

GRANT EXECUTE ON FUNCTION public.get_conversation_counters(uuid, text, text[], uuid, boolean) TO authenticated;
