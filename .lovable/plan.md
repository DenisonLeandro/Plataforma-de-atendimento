## Estado atual (já pronto)

- Coluna `whatsapp_messages.status` existe (não precisa criar `delivery_status` — usar a existente).
- `MessageBubble.tsx` já renderiza: Clock (sending) / Check (sent) / CheckCheck cinza (delivered) / CheckCheck azul (read) / AlertCircle (failed).
- `useWhatsAppSend.ts` já grava `status='sending'` otimista e `'failed'` em erro.
- `send-whatsapp-message` já atualiza para `status='sent'` após sucesso.
- `evolution-webhook` já roteia `messages.update` → `processMessageUpdate` e `messages.read` → `processMessagesRead`.
- `useWhatsAppMessages.ts` já escuta UPDATE via Realtime.

## O que ainda falta / precisa corrigir

### 1. Webhook — mapeamento de status mais robusto e monotônico

Em `supabase/functions/evolution-webhook/index.ts`, na função `processMessageUpdate`:

- Suportar tanto `updates.status` (texto) quanto `updates.ack` (número) — Evolution manda em formatos diferentes.
- Mapa completo:
  - `0` / `'PENDING'` → `pending`
  - `1` / `'SENT'` / `'SERVER_ACK'` → `sent`
  - `2` / `'DELIVERY_ACK'` / `'DELIVERED'` → `delivered`
  - `3` / `'READ'` / `'PLAYED'` → `read`
  - `-1` / `'ERROR'` → `failed`
- **Guarda monotônica**: fazer UPDATE apenas quando o novo status for "maior" que o atual, para nunca voltar (ex.: nunca sobrescrever `read` com `sent`). `failed` é exceção — sempre aplica.
- Aplicar a mesma guarda em `processMessagesRead` (que já força `'read'`) e em `send-whatsapp-message` (não sobrescrever se já for `delivered`/`read`).

### 2. Ordem de status (helper compartilhado no webhook)

Adicionar uma pequena constante de rank dentro do próprio `index.ts` do webhook:

```
pending=0, sent=1, delivered=2, read=3
```

Update SQL usando `.in('status', [...menores])` para garantir monotonicidade sem exigir função SQL nova.

### 3. Frontend — pequenos ajustes

- `MessageBubble.tsx`: no `getStatusIcon`, tratar `'pending'` (vindo do banco, além do `'sending'` otimista) e `'failed'` retornando `AlertCircle` no próprio ícone de status (hoje o AlertCircle aparece só num bloco separado do bubble; adicionar o mesmo case no getStatusIcon garante consistência ao lado do horário).
- Confirmar que o listener Realtime de UPDATE em `useWhatsAppMessages.ts` invalida/atualiza o cache da mensagem correspondente (se hoje só refetcha a lista, ok — não mexer).

### 4. Verificação pós-deploy

1. Redeploy de `evolution-webhook`.
2. Enviar mensagem pela plataforma → Clock imediato → vira Check quando o webhook echo/ack chega.
3. Cliente recebe (celular ligado) → CheckCheck cinza.
4. Cliente abre a conversa → CheckCheck azul.
5. Mensagens recebidas (`is_from_me=false`) continuam sem ícone.
6. Mensagens antigas sem status caem no default (Check cinza) — ok.

## Fora de escopo (não mexer)

- `can_user_see_instance`, `can_access_conversation`, `can_view_conversation`.
- Cor laranja, layout do bubble, lógica de envio.
- Nenhuma migration nova (coluna já existe); só edge functions + 1 componente.
