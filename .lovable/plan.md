## Diagnóstico

Há 157 conversas (de 234) com `last_message_at` e `last_message_preview` em `NULL` — todas anteriores ao dia em que o webhook/envio passou a preencher esses campos. Por isso a lista mostra "Sem mensagens" e sem horário, mesmo existindo mensagens dentro da conversa.

Daqui pra frente, o `evolution-webhook` e o `send-whatsapp-message` já mantêm esses campos atualizados — não há regressão pra corrigir no código.

## Correção

Rodar um **backfill** único na tabela `whatsapp_conversations`, preenchendo `last_message_at` e `last_message_preview` com base na última mensagem real de cada conversa em `whatsapp_messages`:

```sql
UPDATE public.whatsapp_conversations c
SET
  last_message_at = m.created_at,
  last_message_preview = LEFT(COALESCE(NULLIF(m.content, ''), ''), 100)
FROM (
  SELECT DISTINCT ON (conversation_id)
    conversation_id, content, created_at
  FROM public.whatsapp_messages
  ORDER BY conversation_id, created_at DESC
) m
WHERE m.conversation_id = c.id
  AND (c.last_message_at IS NULL OR c.last_message_preview IS NULL);
```

Conversas sem nenhuma mensagem persistida ficam como estão (continuam mostrando "Sem mensagens"), o que é o comportamento correto.

Nenhuma mudança de schema, RLS ou código de frontend é necessária.
