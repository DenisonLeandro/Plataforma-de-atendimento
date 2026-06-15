CREATE OR REPLACE FUNCTION public.can_access_conversation(_user_id uuid, _conversation_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 WHERE has_role(_user_id, 'admin'::app_role)
    UNION
    SELECT 1 WHERE has_role(_user_id, 'supervisor'::app_role)
    UNION
    SELECT 1 FROM whatsapp_conversations c
    WHERE c.id = _conversation_id AND c.assigned_to = _user_id
    UNION
    SELECT 1
    FROM whatsapp_conversations c
    LEFT JOIN assignment_rules r
      ON r.instance_id = c.instance_id AND r.is_active = true
    WHERE c.id = _conversation_id
      AND c.assigned_to IS NULL
      AND (
        r.id IS NULL
        OR (r.rule_type = 'fixed' AND r.fixed_agent_id = _user_id)
        OR (r.rule_type = 'round_robin' AND _user_id = ANY(r.round_robin_agents))
      )
  )
$$;