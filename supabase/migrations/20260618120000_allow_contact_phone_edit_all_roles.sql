-- Permitir que AGENTS editem contatos das conversas a que têm acesso.
-- Contexto: o telefone de contatos não salvos pode vir como `@lid` (número interno
-- longo e incorreto). A correção manual do telefone precisa funcionar para todos os
-- cargos (admin, supervisor e agent). Admin/supervisor já têm UPDATE via a policy
-- "Supervisors can manage contacts" (FOR ALL). Aqui adicionamos UPDATE para agents,
-- espelhando o padrão da policy de SELECT de agents (can_access_conversation).

DROP POLICY IF EXISTS "Agents can update contacts of accessible conversations" ON public.whatsapp_contacts;
CREATE POLICY "Agents can update contacts of accessible conversations"
  ON public.whatsapp_contacts FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.whatsapp_conversations c
      WHERE c.contact_id = whatsapp_contacts.id
        AND public.can_access_conversation(auth.uid(), c.id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.whatsapp_conversations c
      WHERE c.contact_id = whatsapp_contacts.id
        AND public.can_access_conversation(auth.uid(), c.id)
    )
  );
