-- Auditoria da exclusão de contato.
-- Agora que admin/supervisor podem apagar contatos (policy de DELETE criada em
-- 20260729144632), registramos essa ação no log de atividades.
-- Reusa a função genérica _trg_log_hard_delete, adicionando o mapeamento do contato.
-- Fire-and-forget: nunca aborta a exclusão.

CREATE OR REPLACE FUNCTION public._trg_log_hard_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type text;
  v_company uuid;
  v_label text;
BEGIN
  BEGIN
    v_type := CASE TG_TABLE_NAME
      WHEN 'whatsapp_instances' THEN 'instance'
      WHEN 'whatsapp_conversation_notes' THEN 'note'
      WHEN 'whatsapp_conversation_summaries' THEN 'summary'
      WHEN 'assignment_rules' THEN 'rule'
      WHEN 'whatsapp_macros' THEN 'macro'
      WHEN 'whatsapp_contacts' THEN 'contact'
      WHEN 'companies' THEN 'company'
      ELSE TG_TABLE_NAME
    END;

    IF TG_TABLE_NAME = 'companies' THEN
      v_company := OLD.id;
      v_label := (to_jsonb(OLD)->>'name');
    ELSE
      v_company := (to_jsonb(OLD)->>'company_id')::uuid;
      v_label := (to_jsonb(OLD)->>'name');
    END IF;

    PERFORM public._write_activity_log(
      auth.uid(), v_type || '.delete', v_type, OLD.id, v_label, v_company, '{}'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_delete_contacts ON public.whatsapp_contacts;
CREATE TRIGGER trg_log_delete_contacts
  AFTER DELETE ON public.whatsapp_contacts
  FOR EACH ROW EXECUTE FUNCTION public._trg_log_hard_delete();
