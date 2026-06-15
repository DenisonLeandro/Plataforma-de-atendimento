# 1) Por que conversas ficam classificadas como "Geral"

"Geral" é um dos tópicos padrão definidos em `src/constants/conversationTopics.ts` (categoria "Outros") e é atribuído pela edge function `categorize-whatsapp-conversation`, que usa IA (Gemini 2.5 Flash) para ler até as últimas 50 mensagens de texto da conversa e escolher um tópico.

O prompt do sistema instrui explicitamente a IA a:

- "SEMPRE tentar encaixar nos tópicos padrão primeiro"
- "Ser conservador: preferir 'geral' a criar novo tópico"

Ou seja, "Geral" é o **fallback** quando a conversa:

- É muito curta (ex.: só "oi", "bom dia", "obrigado")
- Não tem assunto claro o suficiente para ser classificada como vendas, cobrança, dúvida técnica, agendamento etc.
- Mistura vários temas sem um dominante
- Não tem mensagens de texto suficientes (mensagens de mídia pura não entram na análise)

Isso é por design — evita poluir o sistema com tópicos customizados desnecessários. Não há bug: quem cai em "Geral" provavelmente mandou poucas mensagens ou mensagens genéricas. Não vou alterar essa lógica (você pediu para não mudar nada além do filtro).

# 2) Filtro "Em Aberto" para admin: incluir tudo que estiver aberto OU na fila

## Comportamento atual

Em `src/components/conversations/ConversationsSidebar.tsx`, o filtro de status "Em Aberto" aplica apenas `status = 'active'` na query. Isso já mostra ao admin tanto conversas atribuídas quanto não atribuídas — desde que estejam com `status='active'`.

O gap: conversas **na fila** (sem `assigned_to`) que estejam com outro status (ex.: `closed`, vindas do sync de histórico antes do cliente responder) **não aparecem** no filtro "Em Aberto", mesmo sendo da fila.

## Mudança proposta (somente para admin)

No hook `useWhatsAppConversations` (`src/hooks/whatsapp/useWhatsAppConversations.ts`), aceitar uma nova flag opcional `statusOrUnassigned?: string` (ou similar). Quando setada, a query usa um `.or(...)` no PostgREST:

```
.or(`status.eq.${status},assigned_to.is.null`)
```

aplicado em todas as três queries internas (lista paginada, count total, count de não lidas) de forma consistente.

No `ConversationsSidebar.tsx`:

- Importar `isAdmin` de `useAuth()`.
- Quando `isAdmin === true` **e** `statusFilter === 'active'` (Em Aberto), passar `statusOrUnassigned: 'active'` em vez de `status: 'active'`. Para agentes e demais filtros de status (Encerradas etc.), comportamento permanece exatamente igual.

Resultado: admin no filtro "Em Aberto" verá toda conversa com `status='active'` **OU** qualquer conversa sem responsável (fila), independentemente de quem assumiu. Demais filtros e demais usuários: inalterados.

## Arquivos alterados

- `src/hooks/whatsapp/useWhatsAppConversations.ts` — adicionar parâmetro `statusOrUnassigned` e aplicá-lo via `.or()` nas três queries.
- `src/components/conversations/ConversationsSidebar.tsx` — usar o novo parâmetro apenas quando `isAdmin && statusFilter === 'active'`.

Nada mais será tocado (sem mexer em RLS, em outras telas, no fluxo de sync, no categorize-whatsapp-conversation, etc.).
