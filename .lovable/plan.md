## Reabertura automática de conversas encerradas

### Mudança única
Em `supabase/functions/evolution-webhook/index.ts`, dentro de `processMessageUpsert` (bloco "Update conversation metadata", linhas ~831-851), quando `!key.fromMe` (mensagem do cliente):

1. Buscar também o campo `status` (e `assigned_to`) junto do `unread_count` da conversa.
2. Se `status === 'closed'`, adicionar `status: 'open'` ao `updateData` antes do `.update(...)`.
3. Logar a reabertura: `[evolution-webhook] Auto-reopened closed conversation <id>`.

Nada mais é alterado no update — o mesmo `.update(updateData)` cobre `last_message_at`, `last_message_preview`, `unread_count` e (quando aplicável) `status: 'open'`.

### Notificação ao atendente atribuído
O frontend já escuta `postgres_changes` em `whatsapp_conversations` (via `useWhatsAppConversations`) e em mensagens, então o card atualiza sozinho (badge "Encerrada" some, volta para filtro Abertos, contador incrementa). Nenhuma notificação adicional precisa ser criada — o fluxo existente de toast/badge de não-lidas já sinaliza ao atendente atribuído. (Se quiser uma notificação push/toast dedicada de "conversa reaberta", confirmar — não está implementada hoje e o brief diz "sem badge intermediário".)

### Mensagens do atendente NÃO disparam reabertura
Garantido pela condição `if (!key.fromMe)` já existente — só entra no fluxo quando a mensagem vem do cliente. Mensagens enviadas pelo CS (`fromMe = true`) não tocam no status.

### Botão manual "Reabrir conversa"
`src/components/chat/ChatHeaderMenu.tsx` já mostra o item apenas quando `conversation.status === 'closed'` (linha do ternário `conversation.status === 'closed' ? Reabrir : Encerrar`). Nada a alterar.

### Não alterado
- Nenhum arquivo de frontend.
- Nenhum estilo, layout, lógica de outros status (`archived`, `open`, etc.).
- RLS, schema, hooks — intocados.

### Critérios de aceite cobertos
- Cliente envia → `status` vira `open` no mesmo `UPDATE` da metadata.
- Realtime já propaga: badge "Encerrada" some, conversa reaparece em Abertos/Todas, unread incrementa.
- `fromMe = true` continua sem efeito no status.
- Item "Reabrir conversa" permanece visível só quando `closed`.
