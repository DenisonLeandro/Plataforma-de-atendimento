# Diagnóstico da lentidão de 17/06 e plano de mitigação

## O que encontrei

### Sintoma
Após criar uma nova instância e rodar o sync de histórico, a plataforma ficou lenta para **todos** os atendentes — não só para quem disparou o sync.

### Causa raiz (com evidência)

**1. Tempestade de invalidação via Realtime (causa principal)**

Em `src/hooks/whatsapp/useWhatsAppConversations.ts` há uma assinatura realtime que escuta **todo INSERT** em `whatsapp_messages` (sem filtro de instância/conversa) e, para cada evento, dispara `queryClient.invalidateQueries(['whatsapp','conversations'])`.

Cada invalidação re-executa **4 queries** no servidor (lista paginada com JOIN em `whatsapp_contacts`/`profiles`, count total, unread count, waiting count). Esse hook é montado em várias telas (Conversas, Contatos, Relatório) e por múltiplos componentes — múltiplos atendentes × múltiplas montagens × milhares de inserts no sync = avalanche.

Confirmação em `supabase--slow_queries`:
- `whatsapp_messages` por `conversation_id = ANY(...)` → **29.215 chamadas**, total **26.242s**, média **898ms**, pico **7.99s**.
- Variações de count/list de `whatsapp_conversations` → **23k+ chamadas** cada, somando outros **18.000s** acumulados.

O banco em si é pequeno (281 conversas, 5.364 mensagens, 21 MB). A pressão veio do volume de chamadas, não do volume de dados.

**2. Query "ANY(conversation_ids)" sem LIMIT por conversa**

A query mais cara (`SELECT conversation_id, is_from_me, timestamp FROM whatsapp_messages WHERE conversation_id = ANY($1) ORDER BY timestamp DESC LIMIT n OFFSET 0`) percorre todas as mensagens das conversas listadas. Provavelmente em `useWhatsAppMetrics` / Relatórios. Usada por muitos clientes ao mesmo tempo, vira gargalo.

**3. Saúde do banco no momento do snapshot**
- Memória 62%, conexões 29/60, disco 16% — sem saturação atual.
- **23.122 transações revertidas** acumuladas — compatível com bursts de conflito durante o sync.
- 25 índices nas tabelas principais (alguns duplicados: `idx_conversations_assigned` e `idx_conversations_assigned_to`, `idx_messages_conv_ts` e `idx_whatsapp_messages_conv_ts`) — não é a causa, mas é desperdício.

## Plano de correção

### Fase 1 — Estancar a avalanche (alto impacto, baixo risco)

1. **`useWhatsAppConversations.ts`** — substituir invalidação imediata por **debounce/throttle** (ex.: agrupar eventos em janelas de 1–2s antes de invalidar). Resultado: durante um sync que insere 1.000 mensagens em 30s, o cliente faz ~15 refetches em vez de 1.000.
2. **`useWhatsAppConversations.ts`** — ao receber `postgres_changes` de `whatsapp_messages`, não invalidar a query inteira: atualizar apenas a conversa afetada via `setQueryData` quando possível, ou invalidar só `unreadCount`/`waitingCount` quando o INSERT for relevante.
3. **Filtrar a subscription por instância** quando `filters.instanceId` estiver setado, em vez de escutar todas as instâncias.

### Fase 2 — Aliviar o sync de histórico

4. **`sync-whatsapp-history`** e **`backfill-historical-media`** — inserir mensagens em **lotes maiores com `upsert` em batch** (se ainda não estão), e adicionar pausas curtas entre lotes para não saturar replication slot do realtime.
5. Considerar **desabilitar realtime em `whatsapp_messages`** durante backfill (publicação) ou usar um campo `source = 'backfill'` que o cliente filtra para ignorar nos invalidadores.

### Fase 3 — Queries pesadas

6. Auditar `useWhatsAppMetrics` (e demais consumidores de "ANY(conversation_ids) ORDER BY timestamp DESC"): paginar/limitar por conversa, ou pré-agregar em coluna persistida (já existem `last_message_at`, `last_message_is_from_me`).
7. **Remover índices duplicados** (`idx_conversations_assigned`, `idx_whatsapp_conversations_assigned_to`, `idx_whatsapp_conversations_instance_id`, `idx_whatsapp_conversations_last_msg`, `idx_whatsapp_conversations_status`, `idx_whatsapp_messages_conv_ts`) via migration.

### Fase 4 — Observabilidade

8. Logar no client quando o invalidador disparar mais de N vezes/minuto (warning), para detectar regressão futura.

## Fora de escopo (agora)
- Mexer em RLS, edge functions de envio, ou no Evolution API.
- Upgrade de instância de compute — métricas atuais não justificam.

## O que entregar nesta rodada
Se aprovado, começo pela **Fase 1** (3 itens em `useWhatsAppConversations.ts`) — é onde está o maior ganho com menor risco. Fases 2–4 podem entrar em rodadas seguintes para revisar com calma cada edge function e migration.
