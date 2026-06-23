-- Correção: supervisor (e admin) voltaram a ver TODAS as instâncias após a
-- reescrita de can_access_conversation em 20260623144726, que retornava `true`
-- para qualquer conversa quando o usuário era admin OU supervisor, ignorando
-- agent_instance_access.
--
-- Regra correta (igual à intenção original de 20260617130632):
--   * Dono da conversa (assigned_to) sempre vê — inclusive conversas transferidas
--     de outra instância.
--   * Admin/Supervisor veem as conversas das instâncias que podem ver
--     (can_user_see_instance: sem regras de acesso = vê todas; com regras = só
--     as instâncias atribuídas).
--   * Agente precisa de acesso explícito à instância (agent_instance_access) e
--     só vê conversas não atribuídas conforme assignment_rules.
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

  -- Caso 1: já é o dono (vale mesmo para conversas transferidas de outra instância)
  IF _assigned_to = _user_id THEN
    RETURN true;
  END IF;

  _is_admin := public.has_role(_user_id, 'admin'::app_role);
  _is_supervisor := public.has_role(_user_id, 'supervisor'::app_role);

  -- Admin/Supervisor: respeitam a restrição de instância.
  -- can_user_see_instance => sem regras de acesso vê todas; com regras, só as atribuídas.
  IF _is_admin OR _is_supervisor THEN
    RETURN public.can_user_see_instance(_user_id, _instance_id);
  END IF;

  -- Agente: precisa de acesso explícito à instância.
  IF NOT EXISTS (
    SELECT 1 FROM public.agent_instance_access
    WHERE user_id = _user_id AND instance_id = _instance_id
  ) THEN
    RETURN false;
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
