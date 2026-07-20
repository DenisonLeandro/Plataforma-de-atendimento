
-- Allow agents to create contacts and conversations for instances they have access to

-- whatsapp_contacts: add INSERT policy for agents
CREATE POLICY "Agents can insert contacts for accessible instances"
ON public.whatsapp_contacts
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.is_active AND p.is_approved
  )
  AND (
    public.super_admin_can_write_company(auth.uid(), company_id)
    OR (
      company_id = public.get_user_company_id(auth.uid())
      AND public.can_user_see_instance(auth.uid(), instance_id)
    )
  )
);

-- whatsapp_conversations: replace INSERT policy to include agents with instance access
DROP POLICY IF EXISTS "Service can insert conversations" ON public.whatsapp_conversations;

CREATE POLICY "Users can insert conversations for accessible instances"
ON public.whatsapp_conversations
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.is_active AND p.is_approved
  )
  AND (
    public.super_admin_can_write_company(auth.uid(), company_id)
    OR (
      company_id = public.get_user_company_id(auth.uid())
      AND public.can_user_see_instance(auth.uid(), instance_id)
    )
  )
);
