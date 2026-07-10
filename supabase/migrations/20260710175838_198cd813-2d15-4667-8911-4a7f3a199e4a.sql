CREATE OR REPLACE FUNCTION public.get_conversation_counters(
  _instance_id uuid DEFAULT NULL,
  _status text DEFAULT NULL,
  _status_in text[] DEFAULT NULL,
  _assigned_to uuid DEFAULT NULL,
  _unassigned boolean DEFAULT false
) RETURNS TABLE(unread_count bigint, waiting_count bigint, total_count bigint)
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
  SELECT
    COUNT(*) FILTER (
      WHERE c.unread_count > 0
        AND (c.status IS NULL OR c.status NOT IN ('closed','archived'))
    )::bigint,
    COUNT(*) FILTER (
      WHERE c.last_message_is_from_me = false
        AND (c.status IS NULL OR c.status NOT IN ('closed','archived'))
    )::bigint,
    COUNT(*)::bigint
  FROM public.whatsapp_conversations c
  WHERE public.can_view_conversation(auth.uid(), c.id)
    AND (_instance_id IS NULL OR c.instance_id = _instance_id)
    AND (_status IS NULL OR c.status = _status)
    AND (_status_in IS NULL OR c.status = ANY(_status_in))
    AND (_assigned_to IS NULL OR c.assigned_to = _assigned_to)
    AND (NOT _unassigned OR c.assigned_to IS NULL);
$$;