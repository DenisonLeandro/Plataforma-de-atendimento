CREATE INDEX IF NOT EXISTS idx_conversations_status_last_message
  ON public.whatsapp_conversations (status, last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_conversations_instance_status
  ON public.whatsapp_conversations (instance_id, status);