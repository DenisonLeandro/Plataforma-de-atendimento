DROP POLICY IF EXISTS "Agents can update contacts of accessible conversations" ON public.whatsapp_contacts;

CREATE POLICY "Agents can update contacts of viewable conversations"
ON public.whatsapp_contacts
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.whatsapp_conversations c
    WHERE c.contact_id = whatsapp_contacts.id
      AND public.can_view_conversation(auth.uid(), c.id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.whatsapp_conversations c
    WHERE c.contact_id = whatsapp_contacts.id
      AND public.can_view_conversation(auth.uid(), c.id)
  )
);