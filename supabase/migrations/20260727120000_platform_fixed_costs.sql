-- Custos fixos mensais da plataforma (Claude Max, Lovable, mão de obra, etc.).
-- Rateados igualmente pelo número de empresas ativas no dashboard do super_admin.
-- Aditivo: não altera nenhuma tabela, policy ou função existente.
-- Exclusivo do super_admin: NÃO reusa project_config (cujas linhas globais são
-- legíveis por qualquer autenticado) justamente para não vazar os custos internos.

CREATE TABLE IF NOT EXISTS public.platform_fixed_costs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  label text NOT NULL,
  amount_brl numeric(12,2) NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.platform_fixed_costs ENABLE ROW LEVEL SECURITY;

-- ÚNICA policy: só super_admin lê e escreve. Admin/supervisor/agent não têm acesso.
DROP POLICY IF EXISTS "Super admins manage platform fixed costs" ON public.platform_fixed_costs;
CREATE POLICY "Super admins manage platform fixed costs"
  ON public.platform_fixed_costs FOR ALL
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- A RLS é quem restringe; os GRANTs apenas habilitam o papel authenticated a
-- passar pela policy (super_admin). service_role (edge) mantém acesso total.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_fixed_costs TO authenticated;
GRANT ALL ON public.platform_fixed_costs TO service_role;

-- updated_at automático em UPDATE
CREATE OR REPLACE FUNCTION public.set_platform_fixed_costs_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_platform_fixed_costs_updated_at ON public.platform_fixed_costs;
CREATE TRIGGER trg_platform_fixed_costs_updated_at
  BEFORE UPDATE ON public.platform_fixed_costs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_platform_fixed_costs_updated_at();

-- Realtime para o dashboard atualizar sozinho
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'platform_fixed_costs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.platform_fixed_costs;
  END IF;
END $$;

-- Seed dos custos conhecidos (só na primeira aplicação; idempotente).
-- Lovable entra com 0 para o super_admin ajustar o valor pela tela.
INSERT INTO public.platform_fixed_costs (label, amount_brl)
SELECT v.label, v.amount_brl
FROM (VALUES
  ('Claude Max', 550.00),
  ('Lovable', 0.00),
  ('Mão de obra', 1475.00)
) AS v(label, amount_brl)
WHERE NOT EXISTS (SELECT 1 FROM public.platform_fixed_costs);
