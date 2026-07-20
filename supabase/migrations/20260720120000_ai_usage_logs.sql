-- Dashboard de custos de IA: tabela de logs de uso + RPC de agregação.
-- Aditivo: não altera nenhuma tabela, policy ou função existente.

CREATE TABLE IF NOT EXISTS public.ai_usage_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  feature text NOT NULL CHECK (feature IN (
    'transcription',
    'sentiment',
    'categorization',
    'summary',
    'smart_replies',
    'composer'
  )),
  model text NOT NULL,
  input_tokens integer DEFAULT 0,
  output_tokens integer DEFAULT 0,
  estimated_cost_usd numeric(10,6) DEFAULT 0,
  estimated_cost_brl numeric(10,4) DEFAULT 0,
  -- ON DELETE SET NULL: apagar uma conversa/mensagem não pode falhar por causa do log de custo
  conversation_id uuid REFERENCES public.whatsapp_conversations(id) ON DELETE SET NULL,
  message_id uuid REFERENCES public.whatsapp_messages(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

-- ÚNICA policy de SELECT: só super_admin lê custos de IA.
-- Admin/supervisor/agent não têm acesso a esta tabela.
DROP POLICY IF EXISTS "Super admins can view all ai usage" ON public.ai_usage_logs;
CREATE POLICY "Super admins can view all ai usage"
  ON public.ai_usage_logs FOR SELECT
  USING (public.is_super_admin(auth.uid()));

-- Garante que nenhuma policy de admin-por-empresa sobreviva de uma execução anterior
DROP POLICY IF EXISTS "Admins can view own company ai usage" ON public.ai_usage_logs;

-- Só service_role insere (edge functions usam service_role)
GRANT SELECT ON public.ai_usage_logs TO authenticated;
GRANT ALL ON public.ai_usage_logs TO service_role;

-- Índices
CREATE INDEX IF NOT EXISTS idx_ai_usage_company_id ON public.ai_usage_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_feature ON public.ai_usage_logs(feature);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created_at ON public.ai_usage_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_company_created ON public.ai_usage_logs(company_id, created_at DESC);

-- Realtime para o dashboard atualizar sozinho
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'ai_usage_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_usage_logs;
  END IF;
END $$;

-- RPC de agregação para o dashboard
CREATE OR REPLACE FUNCTION public.get_ai_usage_summary(
  _company_ids uuid[] DEFAULT NULL,
  _start_date timestamp with time zone DEFAULT NOW() - INTERVAL '30 days',
  _end_date timestamp with time zone DEFAULT NOW()
)
RETURNS TABLE(
  company_id uuid,
  company_name text,
  feature text,
  total_calls bigint,
  total_input_tokens bigint,
  total_output_tokens bigint,
  total_cost_usd numeric,
  total_cost_brl numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.company_id,
    c.name AS company_name,
    l.feature,
    COUNT(*) AS total_calls,
    SUM(l.input_tokens) AS total_input_tokens,
    SUM(l.output_tokens) AS total_output_tokens,
    SUM(l.estimated_cost_usd) AS total_cost_usd,
    SUM(l.estimated_cost_brl) AS total_cost_brl
  FROM public.ai_usage_logs l
  JOIN public.companies c ON c.id = l.company_id
  WHERE
    (_company_ids IS NULL OR l.company_id = ANY(_company_ids))
    AND l.created_at >= _start_date
    AND l.created_at <= _end_date
    -- Somente super_admin. Qualquer outro papel recebe zero linhas (sem erro).
    AND (public.is_super_admin(auth.uid()))
  GROUP BY l.company_id, c.name, l.feature
  ORDER BY total_cost_brl DESC;
$$;

REVOKE ALL ON FUNCTION public.get_ai_usage_summary(uuid[], timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ai_usage_summary(uuid[], timestamptz, timestamptz) TO authenticated;
