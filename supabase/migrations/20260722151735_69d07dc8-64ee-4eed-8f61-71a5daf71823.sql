
-- ai_usage_logs: allow same-company admins (and super admins with company access) to delete
CREATE POLICY "Admins can delete their company ai usage logs"
ON public.ai_usage_logs
FOR DELETE
TO authenticated
USING (
  (
    public.has_role(auth.uid(), 'admin'::app_role)
    AND company_id = public.get_user_company_id(auth.uid())
  )
  OR public.super_admin_can_write_company(auth.uid(), company_id)
);

-- whatsapp_reactions: owner-scoped update/delete
CREATE POLICY "Users can update their own reactions"
ON public.whatsapp_reactions
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  AND public.can_access_conversation(auth.uid(), conversation_id)
)
WITH CHECK (
  user_id = auth.uid()
  AND public.can_access_conversation(auth.uid(), conversation_id)
);

CREATE POLICY "Users can delete their own reactions"
ON public.whatsapp_reactions
FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
  AND public.can_access_conversation(auth.uid(), conversation_id)
);

-- whatsapp_sync_jobs: allow users with instance access to delete
CREATE POLICY "Users can delete sync jobs of accessible instances"
ON public.whatsapp_sync_jobs
FOR DELETE
TO authenticated
USING (
  public.can_user_see_instance(auth.uid(), instance_id)
);
