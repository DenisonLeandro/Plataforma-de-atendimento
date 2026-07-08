## Diagnóstico

Investigando o fluxo de reações encontrei **dois bugs distintos** que explicam exatamente o que você viu:

### 1) A reação nunca chega no WhatsApp
O hook `useMessageReaction` (`src/hooks/whatsapp/useMessageReaction.ts`) apenas faz `upsert` na tabela `whatsapp_reactions` do banco. **Não existe nenhuma chamada à Evolution API** (`/message/sendReaction/{instance}`), nem edge function equivalente. Ou seja: a reação aparece só na plataforma e o cliente no WhatsApp nunca vê nada.

### 2) A reação some sozinha da plataforma
No `MessageBubble.tsx` a reação do atendente é salva com:
```
reactor_jid: message.remote_jid   // JID do CONTATO
is_from_me: true                  // sempre true
```
E a tabela tem um `UNIQUE (message_id, reactor_jid)`. Resultado:
- Quando o contato reage/desreage no WhatsApp real, o `evolution-webhook` faz `upsert` no mesmo par `(message_id, remote_jid)` e **sobrescreve ou apaga a reação do atendente**.
- Dois atendentes diferentes também se sobrescrevem entre si.
- Se o contato reage com "" (remoção), a reação do atendente é **deletada**.

Isso bate 100% com o sintoma "às vezes some".

---

## Plano de correção

### 1. Nova edge function `send-whatsapp-reaction`
Chama `POST {baseUrl}/message/sendReaction/{instance}` da Evolution API com:
```json
{ "key": { "remoteJid", "fromMe", "id" }, "reaction": "<emoji ou ''>" }
```
- Valida JWT, resolve a instância via `whatsapp_conversations` → `whatsapp_instances` (+ `whatsapp_instance_secrets` para pegar `apikey`).
- Suporta remoção (emoji vazio) para o dia em que quisermos habilitar "toggle".
- Após sucesso, grava/atualiza em `whatsapp_reactions` usando um `reactor_jid` **do atendente** (ver passo 3), com `is_from_me = true`.

### 2. Ajustar `useMessageReaction` no frontend
Trocar o `upsert` direto por `supabase.functions.invoke('send-whatsapp-reaction', { conversationId, messageId, emoji })`. Mantém o `invalidateQueries` no `onSuccess` — o realtime já cuida do resto.

### 3. Migração para separar reação de atendente da do contato
- Adicionar coluna `user_id uuid null` em `whatsapp_reactions` referenciando `auth.users`.
- Substituir a UNIQUE `(message_id, reactor_jid)` por:
  - UNIQUE parcial `(message_id, user_id) WHERE user_id IS NOT NULL` — reação de cada atendente é única e nunca colide com contato.
  - UNIQUE parcial `(message_id, reactor_jid) WHERE user_id IS NULL` — mantém o comportamento atual para reações vindas do webhook.
- Nada é apagado; reações antigas continuam funcionando.

### 4. Ajustar o webhook (`evolution-webhook/processReaction`)
- Só toca em linhas com `user_id IS NULL` (reações do WhatsApp).
- Nunca deleta/atualiza reações de atendentes ao receber evento vindo do contato — elimina a causa do "sumiço".

### 5. Ajustar o `MessageBubble` / grupamento no `renderReactions`
Agrupar por emoji considerando `user_id` + `reactor_jid` para não deduplicar reação do atendente com a do contato.

---

## Detalhes técnicos

**Endpoint Evolution:** `POST /message/sendReaction/{instance}` com header `apikey`. O `key.id` enviado precisa ser o `message_id` original (já é o que temos em `whatsapp_messages.message_id`); `remoteJid` vem de `conversation.remote_jid`; `fromMe` = `message.is_from_me` da mensagem alvo.

**Identidade do atendente como reactor_jid:** vamos usar o `owner_jid`/`instance_jid` da instância (JID do próprio WhatsApp conectado) — é o que a Evolution vai ecoar de volta no webhook quando o cliente ver a reação. Assim, quando o webhook confirmar, ele encontra a linha existente (mesma `user_id`) e não duplica.

**Timeout & retry:** usa `fetchWithTimeout` já existente em `_shared/fetch-with-timeout.ts`, timeout 10s. Em caso de erro da Evolution API, não grava no banco e devolve erro pro toast do frontend ("Não foi possível enviar a reação").

**Escopo:** só reações. Não mexo em envio de mensagens, edição, mídia ou outras features.
