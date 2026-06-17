
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin boolean;
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  is_admin := public.has_role(auth.uid(), 'admin'::app_role);

  IF NOT is_admin THEN
    IF NEW.is_approved IS DISTINCT FROM OLD.is_approved THEN
      RAISE EXCEPTION 'Not allowed to modify is_approved';
    END IF;
    IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
      RAISE EXCEPTION 'Not allowed to modify is_active';
    END IF;
    IF NEW.email IS DISTINCT FROM OLD.email THEN
      RAISE EXCEPTION 'Not allowed to modify email';
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'Not allowed to modify id';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_privilege_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_privilege_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.can_access_conversation(_user_id uuid, _conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _user_id AND p.is_active = true AND p.is_approved = true
  )
  AND EXISTS (
    SELECT 1 FROM public.whatsapp_conversations c
    WHERE c.id = _conversation_id AND c.assigned_to = _user_id

    UNION

    SELECT 1 FROM public.whatsapp_conversations c
    WHERE c.id = _conversation_id
      AND public.has_role(_user_id, 'admin'::app_role)
      AND public.can_user_see_instance(_user_id, c.instance_id)

    UNION

    SELECT 1 FROM public.whatsapp_conversations c
    WHERE c.id = _conversation_id
      AND public.has_role(_user_id, 'supervisor'::app_role)
      AND public.can_user_see_instance(_user_id, c.instance_id)

    UNION

    SELECT 1
    FROM public.whatsapp_conversations c
    LEFT JOIN public.assignment_rules r
      ON r.instance_id = c.instance_id AND r.is_active = true
    WHERE c.id = _conversation_id
      AND c.assigned_to IS NULL
      AND public.can_user_see_instance(_user_id, c.instance_id)
      AND (
        r.id IS NULL
        OR (r.rule_type = 'fixed' AND r.fixed_agent_id = _user_id)
        OR (r.rule_type = 'round_robin' AND _user_id = ANY(r.round_robin_agents))
      )
  )
$$;

DROP POLICY IF EXISTS "Admins and supervisors can insert message edit history" ON public.whatsapp_message_edit_history;
CREATE POLICY "Users can insert edit history for accessible conversations"
ON public.whatsapp_message_edit_history
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND public.can_access_conversation(
        auth.uid(),
        (SELECT m.conversation_id
           FROM public.whatsapp_messages m
          WHERE m.message_id = whatsapp_message_edit_history.message_id
          LIMIT 1)
      )
);

DROP POLICY IF EXISTS "Approved users can upload to whatsapp-media" ON storage.objects;
CREATE POLICY "Approved users can upload to own folder in whatsapp-media"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'whatsapp-media'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.is_approved = true AND p.is_active = true
  )
);
