
-- 1) profiles: restrict SELECT
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);
CREATE POLICY "Admins and supervisors can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'supervisor'::app_role));

-- 2) user_roles: drop public SELECT
DROP POLICY IF EXISTS "Users can view all roles" ON public.user_roles;
CREATE POLICY "Users can view own role"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 3) system_settings: restrict write to admins; tighten reads to authenticated only
DROP POLICY IF EXISTS "Anon can read system_settings" ON public.system_settings;
DROP POLICY IF EXISTS "Authenticated users can insert system_settings" ON public.system_settings;
DROP POLICY IF EXISTS "Authenticated users can update system_settings" ON public.system_settings;
CREATE POLICY "Admins can insert system_settings"
  ON public.system_settings FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update system_settings"
  ON public.system_settings FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete system_settings"
  ON public.system_settings FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 4) whatsapp-media bucket: restrict DELETE to admin/supervisor
DROP POLICY IF EXISTS "Allow authenticated deletes from whatsapp-media" ON storage.objects;
CREATE POLICY "Admins and supervisors can delete whatsapp-media"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'whatsapp-media'
    AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'supervisor'::app_role))
  );

-- 5) whatsapp_contacts: scope reads to conversation access
DROP POLICY IF EXISTS "Authenticated users can view contacts" ON public.whatsapp_contacts;
CREATE POLICY "Admins and supervisors can view all contacts"
  ON public.whatsapp_contacts FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'supervisor'::app_role));
CREATE POLICY "Agents can view contacts of accessible conversations"
  ON public.whatsapp_contacts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.whatsapp_conversations c
      WHERE c.contact_id = whatsapp_contacts.id
        AND public.can_access_conversation(auth.uid(), c.id)
    )
  );

-- 6) assignment_rules: explicit SELECT (admins/supervisors only)
CREATE POLICY "Admins and supervisors can view rules"
  ON public.assignment_rules FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'supervisor'::app_role));
