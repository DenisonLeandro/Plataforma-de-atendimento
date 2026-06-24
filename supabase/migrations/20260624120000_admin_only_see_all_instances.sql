-- Restaura bypass de ADMIN em can_user_see_instance (somente admin).
-- Admin SEMPRE vê todas as instâncias, independente de agent_instance_access.
-- Supervisor NÃO tem bypass — continua restrito por agent_instance_access.
-- Agentes mantêm a lógica original: sem linhas = vê tudo; com linhas = só as listadas.
-- Mantém os aliases `a` nas subqueries (fix de ambiguidade da migration 200000).
CREATE OR REPLACE FUNCTION public.can_user_see_instance(_user_id uuid, _instance_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'admin'::app_role)
    OR NOT EXISTS (
      SELECT 1 FROM public.agent_instance_access a
      WHERE a.user_id = _user_id
    )
    OR EXISTS (
      SELECT 1 FROM public.agent_instance_access a
      WHERE a.user_id = _user_id AND a.instance_id = _instance_id
    )
$$;
