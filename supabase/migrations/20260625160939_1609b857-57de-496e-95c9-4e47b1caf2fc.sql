CREATE TABLE public.whatsapp_webhook_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instance_id uuid NULL REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL,
  instance_identifier text NOT NULL,
  event text NOT NULL,
  message_id text NULL,
  event_key text NOT NULL UNIQUE,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'processed', 'failed', 'dead_letter')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text NULL,
  locked_at timestamptz NULL,
  next_retry_at timestamptz NULL,
  processed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.whatsapp_webhook_events TO authenticated;
GRANT ALL ON public.whatsapp_webhook_events TO service_role;

ALTER TABLE public.whatsapp_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and supervisors can view webhook events"
ON public.whatsapp_webhook_events
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'supervisor'::app_role)
);

CREATE INDEX idx_whatsapp_webhook_events_status_retry
ON public.whatsapp_webhook_events (status, next_retry_at, created_at);

CREATE INDEX idx_whatsapp_webhook_events_instance_status
ON public.whatsapp_webhook_events (instance_id, status, created_at DESC);

CREATE INDEX idx_whatsapp_webhook_events_message_id
ON public.whatsapp_webhook_events (message_id)
WHERE message_id IS NOT NULL;

CREATE TRIGGER update_whatsapp_webhook_events_updated_at
BEFORE UPDATE ON public.whatsapp_webhook_events
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();