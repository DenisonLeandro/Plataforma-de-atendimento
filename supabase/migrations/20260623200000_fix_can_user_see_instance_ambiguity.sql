-- Correção: can_user_see_instance estava retornando TRUE para todas as instâncias
-- mesmo quando o usuário tinha linhas em agent_instance_access, por ambiguidade
-- entre o parâmetro e a coluna user_id/instance_id (o WHERE virava tautologia).
-- Reescreve com aliases explícitos na tabela para eliminar qualquer ambiguidade.
--
-- Regra: usuário SEM nenhuma linha de acesso vê todas as instâncias; com linhas,
-- vê apenas as instâncias listadas.
CREATE OR REPLACE FUNCTION public.can_user_see_instance(_user_id uuid, _instance_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    NOT EXISTS (
      SELECT 1 FROM public.agent_instance_access a
      WHERE a.user_id = _user_id
    )
    OR EXISTS (
      SELECT 1 FROM public.agent_instance_access a
      WHERE a.user_id = _user_id AND a.instance_id = _instance_id
    )
$$;
