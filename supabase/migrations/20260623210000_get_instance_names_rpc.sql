-- RPC para exibir o nome da instância de origem em conversas transferidas.
-- Problema: a policy de SELECT de whatsapp_instances (can_user_see_instance)
-- bloqueia o embed `instance:whatsapp_instances(...)` para instâncias às quais o
-- usuário não tem acesso. Resultado: conversas transferidas de outra instância
-- apareciam sem o rótulo da instância de origem.
--
-- Esta função (SECURITY DEFINER) devolve apenas os NOMES (não sensíveis; os
-- segredos ficam em whatsapp_instance_secrets) das instâncias cujos ids forem
-- passados — tipicamente os ids das conversas já carregadas na lista. Não altera
-- o seletor de instâncias, que continua restrito por RLS.
CREATE OR REPLACE FUNCTION public.get_instance_names(_ids uuid[])
RETURNS TABLE(id uuid, name text, instance_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.id, i.name, i.instance_name
  FROM public.whatsapp_instances i
  WHERE i.id = ANY(_ids)
$$;

GRANT EXECUTE ON FUNCTION public.get_instance_names(uuid[]) TO authenticated;
