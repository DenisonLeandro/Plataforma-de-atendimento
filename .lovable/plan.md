## Objetivo
Conversas importadas pelo histórico não devem entrar na fila ativa. Devem nascer `closed` e reabrir automaticamente quando o cliente responder em tempo real.

## Mudanças

### 1) `supabase/functions/sync-whatsapp-history/index.ts`
- Em `findOrCreateConversationLite`, alterar o `insert` para `status: 'closed'` (em vez de `'active'`).
- Após criação bem-sucedida, logar: `[sync-whatsapp-history] Conversation created as CLOSED: <id>`.
- `findOrCreateContactLite` permanece intocado.

### 2) `supabase/functions/evolution-webhook/index.ts`
- `findOrCreateConversation`: adicionar parâmetro `isFromMe: boolean` e propagar no único call site (linha ~661), passando `key.fromMe`.
- No `.select`, incluir `status`.
- Se `existingConversation` existir:
  - Se `status === 'closed'` e `isFromMe === false`:
    - `UPDATE whatsapp_conversations SET status='active' WHERE id=<id>`
    - Log: `[evolution-webhook] Conversation REOPENED (client replied): <id>`
    - Chamar `applyAutoAssignment(supabase, instanceId, existingConversation.id)`.
  - Se `status === 'closed'` e `isFromMe === true`: não reabrir.
  - Se `status === 'archived'`: não tocar.
  - Se `status === 'active'`: comportamento atual.
- Conversas novas continuam sendo criadas com `status: 'active'` e disparando `applyAutoAssignment` (sem alteração).

### 3) Nova migration `supabase/migrations/<timestamp>_close_stale_synced_conversations.sql`
Limpeza retroativa única:

```sql
UPDATE public.whatsapp_conversations c
SET status = 'closed'
WHERE c.status = 'active'
  AND c.assigned_to IS NULL
  AND COALESCE(
    (SELECT MAX(timestamp) FROM public.whatsapp_messages m WHERE m.conversation_id = c.id),
    c.created_at
  ) < (NOW() - INTERVAL '24 hours');
```

Sem alterações de schema, sem novos índices. Preserva conversas com `assigned_to` definido (atendimentos longos como jurídico).

## Fora de escopo (não tocar)
`send-whatsapp-message`, `edit-whatsapp-message`, funções de IA, `restart-instance`, `InstanceCard.tsx`, `useSyncWhatsAppHistory`, schema das tabelas.
