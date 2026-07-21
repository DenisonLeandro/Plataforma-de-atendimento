DROP POLICY IF EXISTS "Only admins can delete conversations" ON public.whatsapp_conversations;

CREATE POLICY "Only admins can delete conversations"
ON public.whatsapp_conversations
FOR DELETE
TO authenticated
USING (
  (public.has_role(auth.uid(), 'admin'::app_role)
    AND company_id = public.get_user_company_id(auth.uid()))
  OR public.super_admin_can_write_company(auth.uid(), company_id)
);