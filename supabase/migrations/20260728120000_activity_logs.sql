-- Log de auditoria de ações dos usuários (aba "Atividades").
-- Aditivo. Leitura: super_admin (tudo) OU admin (própria empresa).
-- Captura híbrida: triggers no banco (status/atribuição/deletes) + RPC log_activity
-- chamada pelo front (envio/edição/reação/IA/criação).
-- Princípio: registrar NUNCA pode quebrar a operação original nem a feature.

-- =========================================================
-- 1) Tabela
-- =========================================================
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name text,
  actor_role text,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text,
  target_id uuid,
  target_label text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- SELECT: super_admin vê tudo; admin vê só a própria empresa. Ninguém mais lê.
DROP POLICY IF EXISTS "View activity logs" ON public.activity_logs;
CREATE POLICY "View activity logs" ON public.activity_logs FOR SELECT
USING (
  public.is_super_admin(auth.uid())
  OR (
    public.has_role(auth.uid(), 'admin'::app_role)
    AND company_id = public.get_user_company_id(auth.uid())
  )
);

-- Sem policy de INSERT para authenticated: inserção só via RPC SECURITY DEFINER / service_role.
GRANT SELECT ON public.activity_logs TO authenticated;
GRANT ALL ON public.activity_logs TO service_role;

CREATE INDEX IF NOT EXISTS idx_activity_created_at ON public.activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_company ON public.activity_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_activity_actor ON public.activity_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_activity_action ON public.activity_logs(action);
CREATE INDEX IF NOT EXISTS idx_activity_company_created ON public.activity_logs(company_id, created_at DESC);

-- Realtime (só INSERT interessa)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'activity_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_logs;
  END IF;
END $$;

-- =========================================================
-- 2) Escrita central (resolve nome/papel do ator e insere)
-- =========================================================
CREATE OR REPLACE FUNCTION public._write_activity_log(
  _actor uuid,
  _action text,
  _target_type text,
  _target_id uuid,
  _target_label text,
  _company_id uuid,
  _metadata jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_role text;
BEGIN
  SELECT full_name INTO v_name FROM public.profiles WHERE id = _actor;
  SELECT role::text INTO v_role
  FROM public.user_roles
  WHERE user_id = _actor
  ORDER BY CASE role
    WHEN 'super_admin'::app_role THEN 1
    WHEN 'admin'::app_role THEN 2
    WHEN 'supervisor'::app_role THEN 3
    ELSE 4 END
  LIMIT 1;

  INSERT INTO public.activity_logs
    (actor_user_id, actor_name, actor_role, company_id, action, target_type, target_id, target_label, metadata)
  VALUES
    (_actor, v_name, v_role, _company_id, _action, _target_type, _target_id, _target_label, COALESCE(_metadata, '{}'::jsonb));
END;
$$;

-- =========================================================
-- 3) RPC pública para o front registrar ações de intenção
-- =========================================================
CREATE OR REPLACE FUNCTION public.log_activity(
  _action text,
  _target_type text DEFAULT NULL,
  _target_id uuid DEFAULT NULL,
  _target_label text DEFAULT NULL,
  _company_id uuid DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Ator sempre derivado do JWT (não spoofável). Registro nunca deve estourar erro
  -- para o chamador — engole falhas.
  BEGIN
    PERFORM public._write_activity_log(
      auth.uid(),
      _action,
      _target_type,
      _target_id,
      _target_label,
      COALESCE(_company_id, public.get_user_company_id(auth.uid())),
      _metadata
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.log_activity(text, text, uuid, text, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_activity(text, text, uuid, text, uuid, jsonb) TO authenticated;

-- =========================================================
-- 4) RPC de leitura para a aba (super_admin OU admin da própria empresa)
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_activity_logs(
  _company_ids uuid[] DEFAULT NULL,
  _actor_user_id uuid DEFAULT NULL,
  _actions text[] DEFAULT NULL,
  _start_date timestamp with time zone DEFAULT NOW() - INTERVAL '30 days',
  _end_date timestamp with time zone DEFAULT NOW(),
  _limit integer DEFAULT 200
)
RETURNS TABLE(
  id uuid,
  actor_user_id uuid,
  actor_name text,
  actor_role text,
  company_id uuid,
  company_name text,
  action text,
  target_type text,
  target_id uuid,
  target_label text,
  metadata jsonb,
  created_at timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.id, l.actor_user_id, l.actor_name, l.actor_role,
    l.company_id, c.name AS company_name,
    l.action, l.target_type, l.target_id, l.target_label, l.metadata, l.created_at
  FROM public.activity_logs l
  LEFT JOIN public.companies c ON c.id = l.company_id
  WHERE
    l.created_at >= _start_date
    AND l.created_at <= _end_date
    AND (_actor_user_id IS NULL OR l.actor_user_id = _actor_user_id)
    AND (_actions IS NULL OR l.action = ANY(_actions))
    AND (_company_ids IS NULL OR l.company_id = ANY(_company_ids))
    AND (
      public.is_super_admin(auth.uid())
      OR (
        public.has_role(auth.uid(), 'admin'::app_role)
        AND l.company_id = public.get_user_company_id(auth.uid())
      )
    )
  ORDER BY l.created_at DESC
  LIMIT LEAST(COALESCE(_limit, 200), 1000);
$$;

REVOKE ALL ON FUNCTION public.get_activity_logs(uuid[], uuid, text[], timestamptz, timestamptz, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_activity_logs(uuid[], uuid, text[], timestamptz, timestamptz, integer) TO authenticated;

-- =========================================================
-- 5) Triggers (metade confiável). Cada um engole erros para NUNCA
--    abortar a operação original.
-- =========================================================

-- 5.1 Mudança de status de conversa -> archive/close/reopen
CREATE OR REPLACE FUNCTION public._trg_log_conversation_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
  v_label text;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_action := CASE NEW.status
      WHEN 'archived' THEN 'conversation.archive'
      WHEN 'closed'   THEN 'conversation.close'
      WHEN 'active'   THEN 'conversation.reopen'
      ELSE 'conversation.status_change'
    END;
    BEGIN
      SELECT name INTO v_label FROM public.whatsapp_contacts WHERE id = NEW.contact_id;
      PERFORM public._write_activity_log(
        auth.uid(), v_action, 'conversation', NEW.id, v_label, NEW.company_id,
        jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status)
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_conversation_status ON public.whatsapp_conversations;
CREATE TRIGGER trg_log_conversation_status
  AFTER UPDATE OF status ON public.whatsapp_conversations
  FOR EACH ROW EXECUTE FUNCTION public._trg_log_conversation_status();

-- 5.2 Edição de contato (nome/notas)
CREATE OR REPLACE FUNCTION public._trg_log_contact_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.name IS DISTINCT FROM OLD.name) OR (NEW.notes IS DISTINCT FROM OLD.notes) THEN
    BEGIN
      PERFORM public._write_activity_log(
        auth.uid(), 'contact.update', 'contact', NEW.id, NEW.name, NEW.company_id,
        jsonb_build_object(
          'name_changed', (NEW.name IS DISTINCT FROM OLD.name),
          'notes_changed', (NEW.notes IS DISTINCT FROM OLD.notes)
        )
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_contact_update ON public.whatsapp_contacts;
CREATE TRIGGER trg_log_contact_update
  AFTER UPDATE ON public.whatsapp_contacts
  FOR EACH ROW EXECUTE FUNCTION public._trg_log_contact_update();

-- 5.3 Atribuição/transferência de conversa (usa assigned_by como ator)
CREATE OR REPLACE FUNCTION public._trg_log_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_label text;
BEGIN
  BEGIN
    SELECT ct.name INTO v_label
    FROM public.whatsapp_conversations cv
    LEFT JOIN public.whatsapp_contacts ct ON ct.id = cv.contact_id
    WHERE cv.id = NEW.conversation_id;
    PERFORM public._write_activity_log(
      COALESCE(auth.uid(), NEW.assigned_by),
      'conversation.assign', 'conversation', NEW.conversation_id, v_label, NEW.company_id,
      jsonb_build_object('assigned_to', NEW.assigned_to, 'reason', NEW.reason)
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_assignment ON public.conversation_assignments;
CREATE TRIGGER trg_log_assignment
  AFTER INSERT ON public.conversation_assignments
  FOR EACH ROW EXECUTE FUNCTION public._trg_log_assignment();

-- 5.4 Hard deletes reais (genérico, tolerante a colunas ausentes)
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

DROP TRIGGER IF EXISTS trg_log_delete_instances ON public.whatsapp_instances;
CREATE TRIGGER trg_log_delete_instances
  AFTER DELETE ON public.whatsapp_instances
  FOR EACH ROW EXECUTE FUNCTION public._trg_log_hard_delete();

DROP TRIGGER IF EXISTS trg_log_delete_notes ON public.whatsapp_conversation_notes;
CREATE TRIGGER trg_log_delete_notes
  AFTER DELETE ON public.whatsapp_conversation_notes
  FOR EACH ROW EXECUTE FUNCTION public._trg_log_hard_delete();

DROP TRIGGER IF EXISTS trg_log_delete_summaries ON public.whatsapp_conversation_summaries;
CREATE TRIGGER trg_log_delete_summaries
  AFTER DELETE ON public.whatsapp_conversation_summaries
  FOR EACH ROW EXECUTE FUNCTION public._trg_log_hard_delete();

DROP TRIGGER IF EXISTS trg_log_delete_rules ON public.assignment_rules;
CREATE TRIGGER trg_log_delete_rules
  AFTER DELETE ON public.assignment_rules
  FOR EACH ROW EXECUTE FUNCTION public._trg_log_hard_delete();

DROP TRIGGER IF EXISTS trg_log_delete_macros ON public.whatsapp_macros;
CREATE TRIGGER trg_log_delete_macros
  AFTER DELETE ON public.whatsapp_macros
  FOR EACH ROW EXECUTE FUNCTION public._trg_log_hard_delete();

DROP TRIGGER IF EXISTS trg_log_delete_companies ON public.companies;
CREATE TRIGGER trg_log_delete_companies
  AFTER DELETE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public._trg_log_hard_delete();

-- =========================================================
-- 6) Limpeza automática 90 dias (pg_cron se disponível; nunca falha a migration)
-- =========================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.schedule(
        'activity-logs-cleanup-90d',
        '0 3 * * *',
        $q$DELETE FROM public.activity_logs WHERE created_at < now() - interval '90 days'$q$
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
END $$;
