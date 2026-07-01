
-- 1. project_config: remove anon read of signup configs
DROP POLICY IF EXISTS "Public can read security configs" ON public.project_config;

-- 2. whatsapp_conversations: add WITH CHECK to UPDATE
DROP POLICY IF EXISTS "Users can update accessible conversations" ON public.whatsapp_conversations;
CREATE POLICY "Users can update accessible conversations"
ON public.whatsapp_conversations
FOR UPDATE
USING (auth.uid() IS NOT NULL AND public.can_access_conversation(auth.uid(), id))
WITH CHECK (
  auth.uid() IS NOT NULL
  AND public.can_access_conversation(auth.uid(), id)
  AND (
    public.is_super_admin(auth.uid())
    OR company_id = public.get_user_company_id(auth.uid())
  )
);

-- 3. whatsapp_messages: add WITH CHECK to UPDATE
DROP POLICY IF EXISTS "Users can update own recent messages" ON public.whatsapp_messages;
CREATE POLICY "Users can update own recent messages"
ON public.whatsapp_messages
FOR UPDATE
USING (
  auth.uid() IS NOT NULL
  AND public.can_access_conversation(auth.uid(), conversation_id)
  AND is_from_me = true
  AND "timestamp" > (now() - interval '15 minutes')
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND public.can_access_conversation(auth.uid(), conversation_id)
  AND is_from_me = true
  AND "timestamp" > (now() - interval '15 minutes')
);
