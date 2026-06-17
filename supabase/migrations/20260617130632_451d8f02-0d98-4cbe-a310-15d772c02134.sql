
-- Tabela de acesso a instancias por agente
CREATE TABLE public.agent_instance_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  instance_id uuid NOT NULL REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, instance_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_instance_access TO authenticated;
GRANT ALL ON public.agent_instance_access TO service_role;

ALTER TABLE public.agent_instance_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage instance access"
  ON public.agent_instance_access
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view their own instance access"
  ON public.agent_instance_access
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX idx_agent_instance_access_user ON public.agent_instance_access(user_id);

-- Função: usuário sem regras vê tudo; com regras, só as listadas
CREATE OR REPLACE FUNCTION public.can_user_see_instance(_user_id uuid, _instance_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    NOT EXISTS (SELECT 1 FROM public.agent_instance_access WHERE user_id = _user_id)
    OR EXISTS (
      SELECT 1 FROM public.agent_instance_access
      WHERE user_id = _user_id AND instance_id = _instance_id
    )
$$;

-- Atualizar can_access_conversation para considerar restrição de instância
-- Regra: ver se for assigned_to (sempre) OU (papel adequado E pode ver a instância)
CREATE OR REPLACE FUNCTION public.can_access_conversation(_user_id uuid, _conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    -- Sempre vê se já é o responsável
    SELECT 1 FROM whatsapp_conversations c
    WHERE c.id = _conversation_id AND c.assigned_to = _user_id

    UNION

    -- Admin vê tudo desde que possa ver a instância
    SELECT 1 FROM whatsapp_conversations c
    WHERE c.id = _conversation_id
      AND has_role(_user_id, 'admin'::app_role)
      AND public.can_user_see_instance(_user_id, c.instance_id)

    UNION

    -- Supervisor vê tudo desde que possa ver a instância
    SELECT 1 FROM whatsapp_conversations c
    WHERE c.id = _conversation_id
      AND has_role(_user_id, 'supervisor'::app_role)
      AND public.can_user_see_instance(_user_id, c.instance_id)

    UNION

    -- Agente vê conversas não atribuídas conforme assignment_rules + visibilidade da instância
    SELECT 1
    FROM whatsapp_conversations c
    LEFT JOIN assignment_rules r
      ON r.instance_id = c.instance_id AND r.is_active = true
    WHERE c.id = _conversation_id
      AND c.assigned_to IS NULL
      AND public.can_user_see_instance(_user_id, c.instance_id)
      AND (
        r.id IS NULL
        OR (r.rule_type = 'fixed' AND r.fixed_agent_id = _user_id)
        OR (r.rule_type = 'round_robin' AND _user_id = ANY(r.round_robin_agents))
      )
  )
$$;

-- Atualizar policy de visualização das instâncias
DROP POLICY IF EXISTS "Authenticated users can view instances" ON public.whatsapp_instances;

CREATE POLICY "Users can view permitted instances"
  ON public.whatsapp_instances
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND public.can_user_see_instance(auth.uid(), id)
  );
