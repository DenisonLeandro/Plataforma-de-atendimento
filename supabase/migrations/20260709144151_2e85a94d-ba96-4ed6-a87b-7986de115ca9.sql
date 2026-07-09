DROP POLICY IF EXISTS "Users can update accessible conversations" ON public.whatsapp_conversations;

CREATE POLICY "Users can update viewable conversations"
  ON public.whatsapp_conversations
  FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND can_view_conversation(auth.uid(), id)
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND can_view_conversation(auth.uid(), id)
    AND (
      super_admin_can_write_company(auth.uid(), company_id)
      OR company_id = get_user_company_id(auth.uid())
    )
  );