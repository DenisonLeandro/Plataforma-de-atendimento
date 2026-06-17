
-- Indexes for hot queries
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_conv_ts
  ON public.whatsapp_messages (conversation_id, "timestamp" DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_last_msg
  ON public.whatsapp_conversations (last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_assigned_to
  ON public.whatsapp_conversations (assigned_to);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_instance_id
  ON public.whatsapp_conversations (instance_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_status
  ON public.whatsapp_conversations (status);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_unread
  ON public.whatsapp_conversations (unread_count) WHERE unread_count > 0;

CREATE INDEX IF NOT EXISTS idx_assignment_rules_instance_active
  ON public.assignment_rules (instance_id) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_user_roles_user_role
  ON public.user_roles (user_id, role);

CREATE INDEX IF NOT EXISTS idx_agent_instance_access_user
  ON public.agent_instance_access (user_id, instance_id);

-- Rewrite can_access_conversation: single row read + OR predicates
CREATE OR REPLACE FUNCTION public.can_access_conversation(_user_id uuid, _conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = _user_id AND p.is_active = true AND p.is_approved = true
    )
    AND EXISTS (
      SELECT 1
      FROM public.whatsapp_conversations c
      WHERE c.id = _conversation_id
        AND (
          c.assigned_to = _user_id
          OR (
            public.can_user_see_instance(_user_id, c.instance_id)
            AND (
              public.has_role(_user_id, 'admin'::app_role)
              OR public.has_role(_user_id, 'supervisor'::app_role)
              OR (
                c.assigned_to IS NULL
                AND NOT EXISTS (
                  SELECT 1 FROM public.assignment_rules r
                  WHERE r.instance_id = c.instance_id
                    AND r.is_active = true
                    AND NOT (
                      (r.rule_type = 'fixed' AND r.fixed_agent_id = _user_id)
                      OR (r.rule_type = 'round_robin' AND _user_id = ANY(r.round_robin_agents))
                    )
                )
              )
            )
          )
        )
    )
$$;
