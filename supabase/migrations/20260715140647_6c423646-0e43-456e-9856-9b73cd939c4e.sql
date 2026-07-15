
CREATE INDEX IF NOT EXISTS idx_conv_open_company_lastmsg
  ON public.whatsapp_conversations (company_id, last_message_at DESC NULLS LAST)
  WHERE status NOT IN ('closed','archived');

CREATE INDEX IF NOT EXISTS idx_conv_preview_trgm
  ON public.whatsapp_conversations USING gin (last_message_preview gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_messages_content_trgm
  ON public.whatsapp_messages USING gin (content gin_trgm_ops);
