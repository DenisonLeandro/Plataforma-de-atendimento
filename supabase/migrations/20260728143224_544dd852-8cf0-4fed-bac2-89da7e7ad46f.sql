DROP POLICY IF EXISTS "Admins can insert system_settings" ON public.system_settings;
DROP POLICY IF EXISTS "Admins can update system_settings" ON public.system_settings;
DROP POLICY IF EXISTS "Admins can delete system_settings" ON public.system_settings;
DROP POLICY IF EXISTS "Admins can read system_settings" ON public.system_settings;

CREATE POLICY "Super admins can read system_settings"
  ON public.system_settings FOR SELECT
  TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can insert system_settings"
  ON public.system_settings FOR INSERT
  TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update system_settings"
  ON public.system_settings FOR UPDATE
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can delete system_settings"
  ON public.system_settings FOR DELETE
  TO authenticated
  USING (public.is_super_admin(auth.uid()));