DROP POLICY IF EXISTS "Admins and supervisors can manage assignments" ON public.conversation_assignments;

CREATE POLICY "Users can insert assignments for accessible conversations"
  ON public.conversation_assignments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND public.can_access_conversation(auth.uid(), conversation_id)
  );