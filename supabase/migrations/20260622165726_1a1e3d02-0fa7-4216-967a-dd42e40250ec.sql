
CREATE TABLE public.whatsapp_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('pending','running','completed','failed')),
  cursor jsonb NOT NULL DEFAULT '{}'::jsonb,
  chats_synced int NOT NULL DEFAULT 0,
  messages_synced int NOT NULL DEFAULT 0,
  contacts_synced int NOT NULL DEFAULT 0,
  error_message text,
  started_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE INDEX idx_whatsapp_sync_jobs_instance_status
  ON public.whatsapp_sync_jobs (instance_id, status, started_at DESC);

GRANT SELECT, INSERT ON public.whatsapp_sync_jobs TO authenticated;
GRANT ALL ON public.whatsapp_sync_jobs TO service_role;

ALTER TABLE public.whatsapp_sync_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view sync jobs for instances they can access"
  ON public.whatsapp_sync_jobs
  FOR SELECT
  TO authenticated
  USING (public.can_user_see_instance(auth.uid(), instance_id));

CREATE POLICY "Users can start sync jobs for instances they can access"
  ON public.whatsapp_sync_jobs
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_user_see_instance(auth.uid(), instance_id));

CREATE TRIGGER update_whatsapp_sync_jobs_updated_at
  BEFORE UPDATE ON public.whatsapp_sync_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_sync_jobs;
ALTER TABLE public.whatsapp_sync_jobs REPLICA IDENTITY FULL;
