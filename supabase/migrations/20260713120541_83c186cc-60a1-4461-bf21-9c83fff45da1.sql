
-- 1) Restrict system_settings SELECT to admins/super_admins
DROP POLICY IF EXISTS "Authenticated users can read system_settings" ON public.system_settings;
CREATE POLICY "Admins can read system_settings"
  ON public.system_settings
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));

-- 2) Add direct company scoping to whatsapp_message_edit_history
ALTER TABLE public.whatsapp_message_edit_history
  ADD COLUMN IF NOT EXISTS company_id uuid;

-- Backfill from parent conversation
UPDATE public.whatsapp_message_edit_history h
SET company_id = c.company_id
FROM public.whatsapp_conversations c
WHERE h.conversation_id = c.id
  AND h.company_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_wmeh_company_id
  ON public.whatsapp_message_edit_history (company_id);

-- Trigger to auto-fill company_id from conversation
CREATE OR REPLACE FUNCTION public.set_edit_history_company_id_from_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.company_id IS NULL AND NEW.conversation_id IS NOT NULL THEN
    SELECT company_id INTO NEW.company_id
    FROM public.whatsapp_conversations
    WHERE id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_edit_history_company_id ON public.whatsapp_message_edit_history;
CREATE TRIGGER trg_set_edit_history_company_id
  BEFORE INSERT ON public.whatsapp_message_edit_history
  FOR EACH ROW
  EXECUTE FUNCTION public.set_edit_history_company_id_from_conversation();

-- Tighten RLS with direct company_id checks in addition to conversation access
DROP POLICY IF EXISTS "Users can view edit history of accessible conversations" ON public.whatsapp_message_edit_history;
DROP POLICY IF EXISTS "Users can insert edit history for accessible conversations" ON public.whatsapp_message_edit_history;

CREATE POLICY "Users can view edit history in their company"
  ON public.whatsapp_message_edit_history
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND (
      public.super_admin_can_write_company(auth.uid(), company_id)
      OR (
        company_id = public.get_user_company_id(auth.uid())
        AND public.can_access_conversation(auth.uid(), conversation_id)
      )
    )
  );

CREATE POLICY "Users can insert edit history in their company"
  ON public.whatsapp_message_edit_history
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      public.super_admin_can_write_company(auth.uid(), company_id)
      OR (
        company_id = public.get_user_company_id(auth.uid())
        AND public.can_access_conversation(
          auth.uid(),
          (SELECT m.conversation_id FROM public.whatsapp_messages m
            WHERE m.message_id::text = whatsapp_message_edit_history.message_id LIMIT 1)
        )
      )
    )
  );
