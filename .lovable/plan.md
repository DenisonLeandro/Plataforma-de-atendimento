# Corrigir filtro "Em Aberto" do admin

## Problema

A última alteração fez o admin ver, no filtro "Em Aberto", qualquer conversa com `status='active'` **OU** qualquer conversa sem responsável (fila) — inclusive conversas com `status='closed'` que ainda estavam sem atribuição (caso típico das importadas pelo sync de histórico). Resultado: encerradas aparecem onde não deveriam.

## Correção

No filtro "Em Aberto" o critério correto é simples: **`status = 'active'`**, independente de quem está atendendo. Isso já cobre o que o admin quer ver (todas as conversas em andamento, atribuídas ou na fila), porque qualquer conversa em andamento tem `status='active'` — e quando o cliente responde uma conversa encerrada, o `evolution-webhook` já a reabre para `active` automaticamente.

## Arquivos alterados

- `src/components/conversations/ConversationsSidebar.tsx` — remover o ramo `adminOpenView` que injetava `statusOrUnassigned`. Voltar a passar apenas `status: statusFilter === "all" ? undefined : statusFilter`. Sem condicional por papel.
- `src/hooks/whatsapp/useWhatsAppConversations.ts` — remover o parâmetro `statusOrUnassigned` e os quatro blocos `.or(...)` que foram adicionados (lista, total, não lidas, all). O hook volta ao formato anterior.

Nada mais será tocado. Pill "Na Fila" continua mostrando todas as conversas sem responsável (incluindo encerradas), que é o comportamento correto dela.
