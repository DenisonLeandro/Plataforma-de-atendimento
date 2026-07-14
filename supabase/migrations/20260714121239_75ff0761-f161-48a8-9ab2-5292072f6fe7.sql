
-- 1) Company-scope role-based writes on AI tables

DROP POLICY IF EXISTS "Service can manage summaries" ON public.whatsapp_conversation_summaries;
CREATE POLICY "Service can manage summaries"
  ON public.whatsapp_conversation_summaries
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.whatsapp_conversations c
      WHERE c.id = conversation_id
        AND (
          public.super_admin_can_write_company(auth.uid(), c.company_id)
          OR (
            (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'supervisor'::app_role))
            AND c.company_id = public.get_user_company_id(auth.uid())
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.whatsapp_conversations c
      WHERE c.id = conversation_id
        AND (
          public.super_admin_can_write_company(auth.uid(), c.company_id)
          OR (
            (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'supervisor'::app_role))
            AND c.company_id = public.get_user_company_id(auth.uid())
          )
        )
    )
  );

DROP POLICY IF EXISTS "Service can manage sentiment" ON public.whatsapp_sentiment_analysis;
CREATE POLICY "Service can manage sentiment"
  ON public.whatsapp_sentiment_analysis
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.whatsapp_conversations c
      WHERE c.id = conversation_id
        AND (
          public.super_admin_can_write_company(auth.uid(), c.company_id)
          OR (
            (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'supervisor'::app_role))
            AND c.company_id = public.get_user_company_id(auth.uid())
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.whatsapp_conversations c
      WHERE c.id = conversation_id
        AND (
          public.super_admin_can_write_company(auth.uid(), c.company_id)
          OR (
            (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'supervisor'::app_role))
            AND c.company_id = public.get_user_company_id(auth.uid())
          )
        )
    )
  );

DROP POLICY IF EXISTS "Admins and supervisors can insert sentiment history" ON public.whatsapp_sentiment_history;
CREATE POLICY "Admins and supervisors can insert sentiment history"
  ON public.whatsapp_sentiment_history
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.whatsapp_conversations c
      WHERE c.id = conversation_id
        AND (
          public.super_admin_can_write_company(auth.uid(), c.company_id)
          OR (
            (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'supervisor'::app_role))
            AND c.company_id = public.get_user_company_id(auth.uid())
          )
        )
    )
  );

DROP POLICY IF EXISTS "Admins and supervisors can insert topics history" ON public.whatsapp_topics_history;
CREATE POLICY "Admins and supervisors can insert topics history"
  ON public.whatsapp_topics_history
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.whatsapp_conversations c
      WHERE c.id = conversation_id
        AND (
          public.super_admin_can_write_company(auth.uid(), c.company_id)
          OR (
            (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'supervisor'::app_role))
            AND c.company_id = public.get_user_company_id(auth.uid())
          )
        )
    )
  );

-- 2) Restrict global (company_id IS NULL) project_config rows to admins/super admins

DROP POLICY IF EXISTS project_config_select ON public.project_config;
CREATE POLICY project_config_select
  ON public.project_config
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (company_id IS NOT NULL AND company_id = public.get_user_company_id(auth.uid()))
    OR (company_id IS NULL AND public.has_role(auth.uid(), 'admin'::app_role))
  );

-- 3) Allow UPDATE on whatsapp_sync_jobs for users with instance access

CREATE POLICY "Users can update sync jobs for instances they can access"
  ON public.whatsapp_sync_jobs
  FOR UPDATE
  TO authenticated
  USING (public.can_user_see_instance(auth.uid(), instance_id))
  WITH CHECK (public.can_user_see_instance(auth.uid(), instance_id));
