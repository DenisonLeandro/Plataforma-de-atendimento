
-- Tighten whatsapp-media upload policy: require approved active user
DROP POLICY IF EXISTS "Allow authenticated uploads to whatsapp-media" ON storage.objects;
CREATE POLICY "Approved users can upload to whatsapp-media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'whatsapp-media'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.is_approved = true AND p.is_active = true
  )
);

-- Add INSERT policies for history tables (written by SECURITY DEFINER triggers; restrict direct API writes to admins/supervisors)
CREATE POLICY "Admins and supervisors can insert message edit history"
ON public.whatsapp_message_edit_history FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(),'admin'::app_role)
  OR public.has_role(auth.uid(),'supervisor'::app_role)
);

CREATE POLICY "Admins and supervisors can insert sentiment history"
ON public.whatsapp_sentiment_history FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(),'admin'::app_role)
  OR public.has_role(auth.uid(),'supervisor'::app_role)
);

CREATE POLICY "Admins and supervisors can insert topics history"
ON public.whatsapp_topics_history FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(),'admin'::app_role)
  OR public.has_role(auth.uid(),'supervisor'::app_role)
);
