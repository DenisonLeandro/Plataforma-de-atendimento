ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS media_status text NOT NULL DEFAULT 'none' CHECK (media_status IN ('none', 'pending', 'available', 'failed', 'unavailable')),
  ADD COLUMN IF NOT EXISTS media_error text NULL,
  ADD COLUMN IF NOT EXISTS media_retry_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_media_status
ON public.whatsapp_messages (media_status, created_at DESC)
WHERE message_type IN ('audio', 'image', 'video', 'document', 'sticker');