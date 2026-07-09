## Problema

A política de UPDATE em `whatsapp_conversations` exige `can_access_conversation`, que para atendentes (`agent`) só devolve `true` quando a conversa está atribuída ao próprio usuário (ou não atribuída e coberta por uma regra de distribuição). Como resultado, agentes como a Estela não conseguem encerrar/reabrir conversas atribuídas a outra pessoa — o `UPDATE status` é bloqueado pelo RLS silenciosamente e a conversa continua aparecendo em "Abertos".

## Correção

Trocar a política de UPDATE para usar `can_view_conversation` (mesma checagem já usada no SELECT). Assim, qualquer usuário que enxerga a conversa também pode encerrá-la / reabri-la / arquivá-la.

### Migração

```sql
DROP POLICY "Users can update accessible conversations"
  ON public.whatsapp_conversations;

CREATE POLICY "Users can update viewable conversations"
  ON public.whatsapp_conversations
  FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND can_view_conversation(auth.uid(), id)
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND can_view_conversation(auth.uid(), id)
    AND (
      super_admin_can_write_company(auth.uid(), company_id)
      OR company_id = get_user_company_id(auth.uid())
    )
  );
```

Atribuição/transferência continua protegida — ela passa pela função `assign_conversation` (SECURITY DEFINER) que valida permissões separadamente. Super admin sem exceção de escrita continua bloqueado pelo `WITH CHECK` (empresa diferente).

## Validação

- Logar como agent atribuído a outra conversa da mesma instância → encerrar deve funcionar.
- Super admin sem exceção de escrita em outra empresa → UPDATE continua bloqueado.
- Nenhuma mudança de código no frontend.