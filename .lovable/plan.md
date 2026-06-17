# Por que a plataforma está lenta

Verifiquei o banco e encontrei o culpado. Toda vez que a lista de conversas é aberta (ou atualizada por realtime), o hook `useWhatsAppConversations` executa uma consulta que busca **todas as mensagens de todas as conversas** da instância só para descobrir duas coisas:

- se a última mensagem de cada conversa foi enviada por nós ou pelo cliente (`isLastMessageFromMe`)
- quantas conversas estão "aguardando resposta" (`waitingCount`)

Essa consulta apareceu como a #1 mais lenta do banco:

- **27.917 execuções**, média de **864 ms**, pico de **8 s**, totalizando **~24.000 segundos** de CPU
- ela traz milhares de linhas da tabela `whatsapp_messages` por carregamento, sem limite por conversa

Como o banco fica saturado processando isso, as outras consultas (lista de conversas, contagens, mensagens do chat aberto) ficam na fila e a interface trava.

## O que vou fazer

### 1. Mover esses dois indicadores para a própria tabela de conversas
Adicionar uma coluna `last_message_is_from_me boolean` em `whatsapp_conversations` e mantê-la atualizada automaticamente sempre que uma mensagem nova chega, via trigger no `INSERT` de `whatsapp_messages`. Com isso o frontend lê o dado direto da linha da conversa que ele já está buscando — zero consulta extra.

### 2. Refatorar `useWhatsAppConversations` para remover a consulta pesada
- Remover o bloco que faz `select` em `whatsapp_messages` com `.in('conversation_id', allConversationIds)`.
- Calcular `isLastMessageFromMe` a partir da nova coluna.
- Calcular `waitingCount` com um único `count` na tabela `whatsapp_conversations` (`last_message_is_from_me = false`), aplicando os mesmos filtros (instância, status, atribuição) — mesma semântica de hoje, mas em milissegundos.

### 3. Reforço de índices (defensivo)
Adicionar índice composto `(conversation_id, timestamp DESC)` em `whatsapp_messages` para o restante das consultas de mensagens do chat aberto.

## Detalhes técnicos

**Migração SQL**
- `ALTER TABLE public.whatsapp_conversations ADD COLUMN last_message_is_from_me boolean;`
- Backfill: `UPDATE` com subquery `DISTINCT ON (conversation_id) ... ORDER BY conversation_id, timestamp DESC`.
- Função + trigger `AFTER INSERT ON whatsapp_messages` que faz `UPDATE whatsapp_conversations SET last_message_is_from_me = NEW.is_from_me WHERE id = NEW.conversation_id` (apenas quando `NEW.timestamp >= conversations.last_message_at` ou for a primeira).
- Índice parcial: `CREATE INDEX idx_conversations_waiting ON public.whatsapp_conversations (instance_id, status) WHERE last_message_is_from_me = false;`
- Índice composto: `CREATE INDEX idx_messages_conv_ts ON public.whatsapp_messages (conversation_id, timestamp DESC);`
- `DROP INDEX idx_messages_conversation;` (redundante com o composto acima).

**Frontend (`src/hooks/whatsapp/useWhatsAppConversations.ts`)**
- Remover Query "buscar `allConversations` + `allLastMessages`".
- Adicionar uma consulta leve `count` para `waitingCount` reusando os mesmos filtros.
- Popular `isLastMessageFromMe` direto de `conv.last_message_is_from_me`.

## Escopo / fora de escopo

- **Dentro**: a migração descrita, refatoração do hook `useWhatsAppConversations`, atualização do tipo gerado de `whatsapp_conversations` para incluir o novo campo.
- **Fora**: nenhuma mudança em UI, regras de atribuição, RLS, edge functions ou outras telas. Comportamento visível para o usuário continua idêntico — só fica rápido.
