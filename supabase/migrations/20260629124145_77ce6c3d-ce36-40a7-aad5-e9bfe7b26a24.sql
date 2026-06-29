CREATE OR REPLACE FUNCTION public.get_conversation_counters(
  _instance_id uuid DEFAULT NULL::uuid,
  _status text DEFAULT NULL::text,
  _status_in text[] DEFAULT NULL::text[],
  _assigned_to uuid DEFAULT NULL::uuid,
  _unassigned boolean DEFAULT false
)
RETURNS TABLE(unread_count bigint, waiting_count bigint, total_count bigint)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT
    COUNT(*) FILTER (
      WHERE unread_count > 0
        AND (status IS NULL OR status NOT IN ('closed','archived'))
    )::bigint AS unread_count,
    COUNT(*) FILTER (
      WHERE last_message_is_from_me = false
        AND (status IS NULL OR status NOT IN ('closed','archived'))
    )::bigint AS waiting_count,
    COUNT(*)::bigint AS total_count
  FROM public.whatsapp_conversations c
  WHERE public.can_user_see_instance(auth.uid(), c.instance_id)
    AND (_instance_id IS NULL OR c.instance_id = _instance_id)
    AND (_status IS NULL OR c.status = _status)
    AND (_status_in IS NULL OR c.status = ANY(_status_in))
    AND (_assigned_to IS NULL OR c.assigned_to = _assigned_to)
    AND (NOT _unassigned OR c.assigned_to IS NULL);
$$;