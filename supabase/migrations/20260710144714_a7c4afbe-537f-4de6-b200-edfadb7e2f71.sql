
CREATE OR REPLACE FUNCTION public.can_view_conversation(_user_id uuid, _conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.whatsapp_conversations c
    JOIN public.profiles p ON p.id = _user_id
    WHERE c.id = _conversation_id
      AND p.is_active
      AND p.is_approved
      AND (
        public.is_super_admin(_user_id)
        OR (
          c.company_id = public.get_user_company_id(_user_id)
          AND (
            public.can_user_see_instance(_user_id, c.instance_id)
            OR c.assigned_to = _user_id
          )
        )
      )
  );
$$;
