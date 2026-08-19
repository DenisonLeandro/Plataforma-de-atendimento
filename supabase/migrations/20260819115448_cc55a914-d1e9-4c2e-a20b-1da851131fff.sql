-- Habilitar RLS nas tabelas de backup
ALTER TABLE public.backup_20260811_conversas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_20260811_mensagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_20260811_naolidas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_20260811_sentimento ENABLE ROW LEVEL SECURITY;

-- Garantir acesso via Data API (apenas leitura para authenticated, total para service_role)
GRANT SELECT ON public.backup_20260811_conversas TO authenticated;
GRANT SELECT ON public.backup_20260811_mensagens TO authenticated;
GRANT SELECT ON public.backup_20260811_naolidas TO authenticated;
GRANT SELECT ON public.backup_20260811_sentimento TO authenticated;

GRANT ALL ON public.backup_20260811_conversas TO service_role;
GRANT ALL ON public.backup_20260811_mensagens TO service_role;
GRANT ALL ON public.backup_20260811_naolidas TO service_role;
GRANT ALL ON public.backup_20260811_sentimento TO service_role;

-- backup_20260811_conversas: acesso por empresa + instância
CREATE POLICY "Super admins can manage backup conversations"
  ON public.backup_20260811_conversas
  FOR ALL
  TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "Admins can manage backup conversations of their company"
  ON public.backup_20260811_conversas
  FOR ALL
  TO authenticated
  USING (
    company_id = get_user_company_id(auth.uid())
    AND has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    company_id = get_user_company_id(auth.uid())
    AND has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Users can view backup conversations of accessible instances"
  ON public.backup_20260811_conversas
  FOR SELECT
  TO authenticated
  USING (
    company_id = get_user_company_id(auth.uid())
    AND can_user_see_instance(auth.uid(), instance_id)
  );

-- backup_20260811_mensagens: acesso por empresa + conversa acessível
CREATE POLICY "Super admins can manage backup messages"
  ON public.backup_20260811_mensagens
  FOR ALL
  TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "Admins can manage backup messages of their company"
  ON public.backup_20260811_mensagens
  FOR ALL
  TO authenticated
  USING (
    company_id = get_user_company_id(auth.uid())
    AND has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    company_id = get_user_company_id(auth.uid())
    AND has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Users can view backup messages of accessible conversations"
  ON public.backup_20260811_mensagens
  FOR SELECT
  TO authenticated
  USING (
    company_id = get_user_company_id(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.backup_20260811_conversas c
      WHERE c.id = conversation_id
        AND c.company_id = get_user_company_id(auth.uid())
        AND can_user_see_instance(auth.uid(), c.instance_id)
    )
  );

-- backup_20260811_naolidas: acesso via conversa de backup correspondente
CREATE POLICY "Super admins can manage backup unread counts"
  ON public.backup_20260811_naolidas
  FOR ALL
  TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "Admins can manage backup unread counts of their company"
  ON public.backup_20260811_naolidas
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.backup_20260811_conversas c
      WHERE c.id = backup_20260811_naolidas.id
        AND c.company_id = get_user_company_id(auth.uid())
        AND has_role(auth.uid(), 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.backup_20260811_conversas c
      WHERE c.id = backup_20260811_naolidas.id
        AND c.company_id = get_user_company_id(auth.uid())
        AND has_role(auth.uid(), 'admin')
    )
  );

CREATE POLICY "Users can view backup unread counts of accessible conversations"
  ON public.backup_20260811_naolidas
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.backup_20260811_conversas c
      WHERE c.id = backup_20260811_naolidas.id
        AND c.company_id = get_user_company_id(auth.uid())
        AND can_user_see_instance(auth.uid(), c.instance_id)
    )
  );

-- backup_20260811_sentimento: acesso via conversa de backup correspondente
CREATE POLICY "Super admins can manage backup sentiment"
  ON public.backup_20260811_sentimento
  FOR ALL
  TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "Admins can manage backup sentiment of their company"
  ON public.backup_20260811_sentimento
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.backup_20260811_conversas c
      WHERE c.id = backup_20260811_sentimento.conversation_id
        AND c.company_id = get_user_company_id(auth.uid())
        AND has_role(auth.uid(), 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.backup_20260811_conversas c
      WHERE c.id = backup_20260811_sentimento.conversation_id
        AND c.company_id = get_user_company_id(auth.uid())
        AND has_role(auth.uid(), 'admin')
    )
  );

CREATE POLICY "Users can view backup sentiment of accessible conversations"
  ON public.backup_20260811_sentimento
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.backup_20260811_conversas c
      WHERE c.id = backup_20260811_sentimento.conversation_id
        AND c.company_id = get_user_company_id(auth.uid())
        AND can_user_see_instance(auth.uid(), c.instance_id)
    )
  );