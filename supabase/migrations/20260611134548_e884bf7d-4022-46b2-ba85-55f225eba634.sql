ALTER TABLE public.whatsapp_instances     REPLICA IDENTITY FULL;
ALTER TABLE public.whatsapp_conversations REPLICA IDENTITY FULL;
ALTER TABLE public.whatsapp_messages      REPLICA IDENTITY FULL;
ALTER TABLE public.whatsapp_contacts      REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE
  public.whatsapp_instances,
  public.whatsapp_conversations,
  public.whatsapp_messages,
  public.whatsapp_contacts;