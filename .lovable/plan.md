## Problema

O filtro **"Aguardando"** mostra 734 conversas, mas inclui conversas já **encerradas/arquivadas**. Hoje a contagem só olha `last_message_is_from_me = false`, sem considerar `status`. Além disso, a plataforma não reage quando a conversa é lida/respondida fora dela (ex.: você responde direto pelo WhatsApp no celular, ou marca como lida lá).

## Objetivos

1. O contador e o filtro "Aguardando" devem contar apenas conversas **abertas** (status `active`, ignorando `closed`/`archived`).
2. A plataforma deve refletir automaticamente, em tempo quase real, quando uma conversa é **lida**, **respondida** ou **encerrada** em qualquer canal (WhatsApp celular, plataforma, web).

## Mudanças

### 1. Contadores corretos (banco)
Atualizar a função `public.get_conversation_counters` para que `waiting_count` e `unread_count` **excluam** conversas com `status IN ('closed','archived')`. `total_count` continua respeitando o filtro de status pedido pela tela.

```text
waiting_count  = COUNT WHERE last_message_is_from_me = false
                 AND status NOT IN ('closed','archived')
unread_count   = COUNT WHERE unread_count > 0
                 AND status NOT IN ('closed','archived')
```

### 2. Filtro "Aguardando" na sidebar
Em `src/components/conversations/ConversationsSidebar.tsx`, o filtro `waiting` passa a exigir também `status !== 'closed' && status !== 'archived'`. Mesma regra no filtro `unread`. Assim a lista visível bate com o número do pill.

### 3. Detectar leitura/resposta vindas do WhatsApp (webhook)
Hoje `evolution-webhook` só trata `messages.upsert`, `messages.update` e `connection.update`. Vamos adicionar:

- **`messages.read` / `MESSAGES_READ`**: zera `unread_count` da conversa correspondente (chave por `remoteJid` + `instance_id`). Também marca as mensagens com `status = 'read'`.
- **`chats.update` / `CHATS_UPDATE`**: quando vier `unreadCount: 0`, zera `unread_count` da conversa correspondente.
- **`messages.upsert` com `key.fromMe = true`** (já existe parcialmente): além de reabrir conversa fechada, garantir `unread_count = 0` e `last_message_is_from_me = true` (já é feito por trigger, manter). Isso cobre o caso "respondi pelo celular" — a conversa sai automaticamente do "Aguardando".

### 4. Encerramento espelhado
Quando a conversa é encerrada na plataforma (`status = 'closed'`), ela já some do "Aguardando" depois do item 1. Não há API do WhatsApp para "encerrar" do lado deles, então o espelho prático é:

- Encerrar na plataforma → some do Aguardando imediatamente (item 1+2).
- Responder pelo WhatsApp → `fromMe` chega via webhook → `last_message_is_from_me = true` → some do Aguardando.
- Marcar como lida pelo WhatsApp → `messages.read`/`chats.update` → `unread_count = 0` (item 3).

### 5. Limpeza pontual dos 734 atuais
Rodar um update único para sincronizar o estado: conversas com `status IN ('closed','archived')` não devem aparecer no filtro depois da correção, então nenhum backfill de dados é necessário — só recalcular os contadores (a RPC nova já resolve). Não vamos alterar `status` de nenhuma conversa.

## Arquivos afetados

```text
supabase/migrations/<novo>.sql                 (RPC get_conversation_counters)
supabase/functions/evolution-webhook/index.ts  (eventos messages.read / chats.update)
src/components/conversations/ConversationsSidebar.tsx (filtros waiting/unread)
```

## Fora do escopo

- Encerramento automático por inatividade (já existe rotina manual; podemos planejar depois).
- Mudanças de UI nos pills além de respeitar os novos números.
