
-- 1. Coluna desnormalizada
ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS last_message_is_from_me boolean;

-- 2. Backfill a partir da última mensagem de cada conversa
UPDATE public.whatsapp_conversations c
SET last_message_is_from_me = m.is_from_me
FROM (
  SELECT DISTINCT ON (conversation_id) conversation_id, is_from_me
  FROM public.whatsapp_messages
  ORDER BY conversation_id, "timestamp" DESC
) m
WHERE m.conversation_id = c.id;

-- 3. Trigger para manter atualizado
CREATE OR REPLACE FUNCTION public.sync_last_message_is_from_me()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.whatsapp_conversations
  SET last_message_is_from_me = NEW.is_from_me
  WHERE id = NEW.conversation_id
    AND (last_message_at IS NULL OR NEW."timestamp" >= last_message_at);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_last_message_is_from_me ON public.whatsapp_messages;
CREATE TRIGGER trg_sync_last_message_is_from_me
AFTER INSERT ON public.whatsapp_messages
FOR EACH ROW EXECUTE FUNCTION public.sync_last_message_is_from_me();

-- 4. Índices
CREATE INDEX IF NOT EXISTS idx_messages_conv_ts
  ON public.whatsapp_messages (conversation_id, "timestamp" DESC);

DROP INDEX IF EXISTS public.idx_messages_conversation;

CREATE INDEX IF NOT EXISTS idx_conversations_waiting
  ON public.whatsapp_conversations (instance_id, status)
  WHERE last_message_is_from_me = false;
