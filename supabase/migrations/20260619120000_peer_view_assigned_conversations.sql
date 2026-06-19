-- Regra 2: conversa atribuída não some da lista dos peers da mesma instância.
-- Hoje, can_access_conversation só deixa um agent ver conversa atribuída se for o
-- responsável (ou se estiver NULL na fila). Para um peer da mesma instância, a conversa
-- some ao ser atribuída. Esta migration cria uma função SELECT-only mais permissiva e
-- repointa APENAS as policies de SELECT (conversations + messages) para ela.
-- Escrita (UPDATE/INSERT/DELETE) continua governada por can_access_conversation — peers
-- veem e leem, mas não respondem, não reatribuem, não mudam status. Cenário A aprovado.
-- NÃO altera can_access_conversation nem can_user_see_instance.

-- 1) Função de visibilidade (SELECT-only). Mesma estratégia das funções existentes:
--    SQL / STABLE / SECURITY DEFINER / search_path = public.
CREATE OR REPLACE FUNCTION public.can_view_conversation(_user_id uuid, _conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- (a) tudo o que já pode acessar/escrever continua podendo ver; OU
  SELECT public.can_access_conversation(_user_id, _conversation_id)
  -- (b) peer da mesma instância vê conversa JÁ ATRIBUÍDA (a qualquer um), read-only.
  --     Replica o guard de perfil ativo/aprovado de can_access_conversation para não
  --     liberar usuário inativo/pendente/deletado. Mantém o gate de instância
  --     (can_user_see_instance) para preservar a Regra 3 (não vaza outras instâncias).
  OR (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = _user_id AND p.is_active = true AND p.is_approved = true
    )
    AND EXISTS (
      SELECT 1 FROM public.whatsapp_conversations c
      WHERE c.id = _conversation_id
        AND c.assigned_to IS NOT NULL
        AND public.can_user_see_instance(_user_id, c.instance_id)
    )
  )
$$;

COMMENT ON FUNCTION public.can_view_conversation(uuid, uuid) IS
  'Used by SELECT policies to allow peer agents to view conversations assigned to colleagues in the same instance — read-only. Write access stays governed by can_access_conversation.';

GRANT EXECUTE ON FUNCTION public.can_view_conversation(uuid, uuid) TO authenticated;

-- 2) Repointar SELECT de whatsapp_conversations.
DROP POLICY IF EXISTS "Users can view accessible conversations" ON public.whatsapp_conversations;
CREATE POLICY "Users can view accessible conversations" ON public.whatsapp_conversations
FOR SELECT USING (
  auth.uid() IS NOT NULL AND
  public.can_view_conversation(auth.uid(), id)
);

-- 3) Repointar SELECT de whatsapp_messages.
-- Cenário A: peer reads message text. Reactions, edit-history and sentiment stay gated by
-- can_access_conversation — by design, future review.
DROP POLICY IF EXISTS "Users can view messages of accessible conversations" ON public.whatsapp_messages;
CREATE POLICY "Users can view messages of accessible conversations" ON public.whatsapp_messages
FOR SELECT USING (
  auth.uid() IS NOT NULL AND
  public.can_view_conversation(auth.uid(), conversation_id)
);
