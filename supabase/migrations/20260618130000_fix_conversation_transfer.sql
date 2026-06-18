-- Fix da transferência de conversa (C1).
-- Problema 1: a RLS de profiles/user_roles restringe um `agent` a ver só o próprio
--   perfil/papel, então o diálogo de transferência lista zero atendentes.
-- Problema 2: a RLS de UPDATE de whatsapp_conversations (can_access_conversation)
--   bloqueia um `agent` de reatribuir uma conversa que está consigo para outro agente.
-- Solução: duas funções SECURITY DEFINER que expõem só o necessário e validam o acesso,
--   sem afrouxar a RLS de profiles nem a policy de UPDATE.

DROP FUNCTION IF EXISTS public.get_assignable_agents(uuid);
DROP FUNCTION IF EXISTS public.assign_conversation(uuid, uuid, text);

-- 1) Lista de atendentes atribuíveis (campos mínimos, sem email).
--    Decisão de produto: transferência é CROSS-INSTÂNCIA — lista TODOS os atendentes
--    ativos da plataforma, independente de agent_instance_access (advocacia única,
--    multi-unidade; agent_instance_access continua valendo para o resto do sistema).
--    _instance_id é mantido só para contar active_conversations naquela instância
--    (carga de trabalho). SECURITY DEFINER conta correto mesmo para um `agent`.
CREATE OR REPLACE FUNCTION public.get_assignable_agents(_instance_id uuid)
RETURNS TABLE (
  id uuid,
  full_name text,
  avatar_url text,
  status text,
  role public.app_role,
  active_conversations bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
    AND p.id <> auth.uid()
$$;

REVOKE ALL ON FUNCTION public.get_assignable_agents(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_assignable_agents(uuid) TO authenticated;

-- 2) Atribuir/transferir/devolver conversa de forma controlada.
--    Valida que o chamador pode acessar a conversa (estado atual), atualiza assigned_to
--    e registra o histórico. _assigned_to NULL = devolver para a fila.
CREATE OR REPLACE FUNCTION public.assign_conversation(
  _conversation_id uuid,
  _assigned_to uuid,
  _reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _caller uuid := auth.uid();
  _current_assigned uuid;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  -- O chamador precisa ter acesso à conversa no estado atual.
  IF NOT public.can_access_conversation(_caller, _conversation_id) THEN
    RAISE EXCEPTION 'Sem permissão para atribuir esta conversa';
  END IF;

  SELECT assigned_to
    INTO _current_assigned
  FROM public.whatsapp_conversations
  WHERE id = _conversation_id;

  -- O destinatário (quando houver) só precisa ser um atendente válido e ativo.
  -- Transferência é cross-instância (decisão de produto): NÃO exige acesso à instância.
  IF _assigned_to IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id
    WHERE p.id = _assigned_to
      AND p.is_active = true
      AND p.is_approved = true
      AND ur.role IN ('admin', 'supervisor', 'agent')
  ) THEN
    RAISE EXCEPTION 'Atendente inválido';
  END IF;

  UPDATE public.whatsapp_conversations
  SET assigned_to = _assigned_to,
      updated_at = now()
  WHERE id = _conversation_id;

  INSERT INTO public.conversation_assignments
    (conversation_id, assigned_from, assigned_to, assigned_by, reason)
  VALUES
    (_conversation_id, _current_assigned, COALESCE(_assigned_to, _caller), _caller, _reason);
END;
$$;

REVOKE ALL ON FUNCTION public.assign_conversation(uuid, uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.assign_conversation(uuid, uuid, text) TO authenticated;
