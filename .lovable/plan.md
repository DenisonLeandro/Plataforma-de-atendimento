## Objetivo
Encerrar em massa as conversas da empresa **Acquadu** (`692489ea-feda-4df1-8dbd-e1c88375eaef`) cuja última mensagem foi antes de **27/07/2026**.

## Escopo confirmado
- 153 conversas atualmente com status diferente de `closed`/`archived` e `last_message_at < 2026-07-27` (inclui as sem `last_message_at`).
- Sem geração de resumo por IA (seria custoso e não foi pedido).

## SQL a executar (via ferramenta de insert/update)
```sql
UPDATE public.whatsapp_conversations
SET status = 'closed', updated_at = now()
WHERE company_id = '692489ea-feda-4df1-8dbd-e1c88375eaef'
  AND status NOT IN ('closed','archived')
  AND (last_message_at < '2026-07-27'::timestamptz OR last_message_at IS NULL);
```

## Observações
- Só altera `status` (histórico de mensagens preservado).
- Reabertura futura pode ser feita normalmente pela UI ou via SQL inverso.
- Se quiser excluir as conversas sem `last_message_at`, me avise antes de aprovar.
