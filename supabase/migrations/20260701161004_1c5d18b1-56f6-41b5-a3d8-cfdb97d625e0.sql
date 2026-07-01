
-- 1) Backfill company_id a partir da instância
UPDATE public.whatsapp_conversations c
SET company_id = i.company_id
FROM public.whatsapp_instances i
WHERE c.instance_id = i.id AND c.company_id IS NULL AND i.company_id IS NOT NULL;

UPDATE public.whatsapp_contacts ct
SET company_id = i.company_id
FROM public.whatsapp_instances i
WHERE ct.instance_id = i.id AND ct.company_id IS NULL AND i.company_id IS NOT NULL;

UPDATE public.whatsapp_messages m
SET company_id = c.company_id
FROM public.whatsapp_conversations c
WHERE m.conversation_id = c.id AND m.company_id IS NULL AND c.company_id IS NOT NULL;

-- 2) Trigger de segurança: preenche company_id a partir de instance_id se vier NULL
CREATE OR REPLACE FUNCTION public.set_company_id_from_instance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.company_id IS NULL AND NEW.instance_id IS NOT NULL THEN
    SELECT company_id INTO NEW.company_id
    FROM public.whatsapp_instances
    WHERE id = NEW.instance_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_message_company_id_from_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.company_id IS NULL AND NEW.conversation_id IS NOT NULL THEN
    SELECT company_id INTO NEW.company_id
    FROM public.whatsapp_conversations
    WHERE id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_company_id_conversations ON public.whatsapp_conversations;
CREATE TRIGGER trg_set_company_id_conversations
BEFORE INSERT ON public.whatsapp_conversations
FOR EACH ROW EXECUTE FUNCTION public.set_company_id_from_instance();

DROP TRIGGER IF EXISTS trg_set_company_id_contacts ON public.whatsapp_contacts;
CREATE TRIGGER trg_set_company_id_contacts
BEFORE INSERT ON public.whatsapp_contacts
FOR EACH ROW EXECUTE FUNCTION public.set_company_id_from_instance();

DROP TRIGGER IF EXISTS trg_set_company_id_messages ON public.whatsapp_messages;
CREATE TRIGGER trg_set_company_id_messages
BEFORE INSERT ON public.whatsapp_messages
FOR EACH ROW EXECUTE FUNCTION public.set_message_company_id_from_conversation();
