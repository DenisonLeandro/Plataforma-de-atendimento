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
    SELECT 1 FROM whatsapp_conversations
    WHERE id = _conversation_id AND assigned_to = _user_id
  )
$$;