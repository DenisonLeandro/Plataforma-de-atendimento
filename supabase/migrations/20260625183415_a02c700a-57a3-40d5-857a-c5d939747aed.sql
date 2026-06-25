DROP POLICY IF EXISTS "Agents can view contacts of accessible conversations" ON public.whatsapp_contacts;

CREATE POLICY "Agents can view contacts of viewable conversations"
ON public.whatsapp_contacts
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.whatsapp_conversations c
    WHERE c.contact_id = whatsapp_contacts.id
      AND public.can_view_conversation(auth.uid(), c.id)
  )
);