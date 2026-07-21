
-- Remove policies antigas que dependiam da existência de uma conversa
DROP POLICY IF EXISTS "Agents can view contacts of viewable conversations" ON public.whatsapp_contacts;
DROP POLICY IF EXISTS "Agents can update contacts of viewable conversations" ON public.whatsapp_contacts;

-- Nova visibilidade: agentes veem contatos das instâncias que podem acessar
CREATE POLICY "Agents can view contacts of accessible instances"
ON public.whatsapp_contacts
FOR SELECT
TO authenticated
USING (public.can_user_see_instance(auth.uid(), instance_id));

-- Nova atualização: agentes atualizam contatos das instâncias que podem acessar
CREATE POLICY "Agents can update contacts of accessible instances"
ON public.whatsapp_contacts
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.is_active AND p.is_approved
  )
  AND public.can_user_see_instance(auth.uid(), instance_id)
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.is_active AND p.is_approved
  )
  AND public.can_user_see_instance(auth.uid(), instance_id)
);

-- Cleanup do diagnóstico
DROP FUNCTION IF EXISTS public._diag_upsert_contact(uuid,uuid,text,text);
