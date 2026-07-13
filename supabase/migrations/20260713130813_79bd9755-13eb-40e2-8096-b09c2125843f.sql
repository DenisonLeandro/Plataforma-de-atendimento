
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_pending_media
  ON public.whatsapp_messages (created_at DESC)
  WHERE media_status IN ('pending', 'failed');
