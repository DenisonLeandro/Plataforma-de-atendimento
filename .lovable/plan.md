## Diagnóstico

O erro ao "Assumir" e a impossibilidade de "Transferir" para o cargo **atendente** vêm de uma única política RLS na tabela `conversation_assignments`:

```
INSERT policy: "Admins and supervisors can manage assignments"
WITH CHECK: has_role(admin) OR has_role(supervisor)
```

Fluxo atual quando um atendente clica em **Assumir** ou **Transferir**:

1. `UPDATE whatsapp_conversations SET assigned_to = ...` — funciona, porque a policy de UPDATE usa `can_access_conversation` (que já contempla atendentes elegíveis via regras de atribuição e o próprio dono da conversa). Por isso a conversa de fato fica com o atendente "depois de um tempo".
2. `INSERT INTO conversation_assignments (...)` para registrar o histórico — **bloqueado pelo RLS** para o cargo `agent`. Por isso o hook lança erro e dispara o toast vermelho ("Erro ao atribuir" / "Erro ao transferir"), mesmo com a conversa já transferida no passo 1.

Resultado para o usuário: aparece toast de erro, mas a conversa acaba transferida. Para transferências em si, o botão **Transferir** já é renderizado para qualquer pessoa atribuída à conversa (`canAssign || (!isInQueue && isAssignedToMe)`) — então o problema também é só o INSERT bloqueado.

## Mudanças

### 1. Migração — corrigir RLS de `conversation_assignments`

Substituir a policy de INSERT por uma que permite registrar histórico para qualquer conversa que o usuário possa acessar (ou seja: admin, supervisor, dono atual, ou atendente elegível por regra de atribuição):

```sql
DROP POLICY "Admins and supervisors can manage assignments"
  ON public.conversation_assignments;

CREATE POLICY "Users can insert assignments for accessible conversations"
  ON public.conversation_assignments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND public.can_access_conversation(auth.uid(), conversation_id)
  );
```

A policy de SELECT já está correta (usa `can_access_conversation`). UPDATE/DELETE no histórico continuam restritos (sem policy → bloqueados), o que é o comportamento desejado para um log imutável.

### 2. UI — sem mudança de regra de permissão

O botão **Assumir** já aparece para qualquer usuário quando a conversa está sem dono, e **Transferir** já aparece para o dono atual ou para admin/supervisor. Após a correção do RLS, ambos passarão a funcionar para o cargo `agent` sem disparar toast de erro.

Nenhum ajuste em `useConversationAssignment.ts` é necessário — o erro vai sumir naturalmente porque o INSERT vai passar.

## Fora de escopo

- Permitir atendente "devolver para fila" conversas alheias (continua só para dono/admin/supervisor — já é o comportamento atual e correto).
- Alterar a policy de INSERT em `whatsapp_conversations` (criar conversa nova segue restrito a admin/supervisor, conforme já está).
