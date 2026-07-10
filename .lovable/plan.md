## Diagnóstico

Confirmado nos logs de `evolution-webhook`:
- `messages.update` **chega** normalmente para `piscinas-ibipora`, `advocacia-denison`, `cinco-conjuntos`.
- `rawStatus` sai como string (`"READ"`, `"DELIVERY_ACK"`) — o mapa já cobre isso.
- Mas o `messageId` sai `undefined`, então o `advanceMessageStatus` nunca roda.
- Query no banco confirma: 8.269 mensagens `is_from_me=true`, todas em `status='sent'`.

Motivo: `processMessageUpdate` só lê o ID em `updates.key?.id || data.key?.id`. A Evolution (nesse payload de status) manda em `data.keyId` (às vezes `data.messageId` ou `data.id`). Nada a ver com coluna faltando — a coluna `status` já existe e faz o papel do "delivery_status".

## Plano (backend só, sem tocar frontend)

### 1. Corrigir extração do messageId em `supabase/functions/evolution-webhook/index.ts`
Na função `processMessageUpdate`, ampliar as chaves consideradas para pegar o ID em todos os formatos que a Evolution usa:

```ts
const messageId =
  updates.key?.id ||
  data.key?.id ||
  updates.keyId ||
  data.keyId ||
  updates.messageId ||
  data.messageId ||
  updates.id ||
  data.id;
```

E logar o payload bruto (uma vez) quando ainda faltar ID, para pegar qualquer variante futura sem precisar adivinhar.

### 2. Deploy de `evolution-webhook`
Só essa função. `send-whatsapp-message` já grava `status='sent'` com proteção de não retroceder — não precisa mexer.

### 3. Verificação
- Aguardar 1–2 min após o deploy e conferir logs: linhas do tipo `Message status → delivered for <id>` / `→ read for <id>` devem aparecer.
- Rodar:
  ```sql
  SELECT status, count(*)
  FROM whatsapp_messages
  WHERE is_from_me = true AND created_at > now() - interval '1 hour'
  GROUP BY status;
  ```
  Esperado: aparecer `delivered` e `read` para mensagens novas. Mensagens antigas (histórico) continuam em `sent` porque o Evolution não reenviega ACKs passados — isso é limite da Evolution, não do nosso código.

### 4. (Se ainda não funcionar em alguma instância)
Rodar o botão "Sincronizar webhook" (ícone `Webhook`) no card da instância — garante que `MESSAGES_UPDATE` está habilitado no Evolution. Os logs já mostram que as 3 instâncias testadas recebem o evento, então provavelmente é dispensável.

## Fora de escopo (explicitamente)
- **Não** criar coluna `delivery_status` (duplicaria `status` e quebraria webhook, send e `MessageBubble`).
- **Não** mexer em `can_user_see_instance`, `can_access_conversation`, `can_view_conversation`.
- **Não** adicionar bypass de supervisor.
- **Não** tocar em cor laranja ou qualquer coisa de UI.
- **Não** mudar `send-whatsapp-message` (já está correto).

## Detalhes técnicos
- Arquivo alterado: `supabase/functions/evolution-webhook/index.ts` (função `processMessageUpdate`, ~10 linhas).
- Sem migração de banco.
- Sem mudança de RLS.
- Deploy: só `evolution-webhook`.
