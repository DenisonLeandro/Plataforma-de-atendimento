
ALTER TABLE public.whatsapp_conversation_notes
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.whatsapp_conversation_notes
  ALTER COLUMN created_by SET DEFAULT auth.uid();

DROP POLICY IF EXISTS "Users can manage notes on accessible conversations" ON public.whatsapp_conversation_notes;

CREATE POLICY "Users can view notes on accessible conversations"
ON public.whatsapp_conversation_notes
FOR SELECT
USING (auth.uid() IS NOT NULL AND public.can_access_conversation(auth.uid(), conversation_id));

CREATE POLICY "Users can insert own notes on accessible conversations"
ON public.whatsapp_conversation_notes
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND public.can_access_conversation(auth.uid(), conversation_id)
  AND created_by = auth.uid()
);

CREATE POLICY "Users can update own notes; admins/supervisors can update any"
ON public.whatsapp_conversation_notes
FOR UPDATE
USING (
  auth.uid() IS NOT NULL
  AND public.can_access_conversation(auth.uid(), conversation_id)
  AND (
    created_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND public.can_access_conversation(auth.uid(), conversation_id)
  AND (
    created_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
  )
);

CREATE POLICY "Users can delete own notes; admins/supervisors can delete any"
ON public.whatsapp_conversation_notes
FOR DELETE
USING (
  auth.uid() IS NOT NULL
  AND public.can_access_conversation(auth.uid(), conversation_id)
  AND (
    created_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
  )
);
