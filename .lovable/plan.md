## Ação

Encerrar em lote todas as conversas da empresa **Piscinas Ibipora** (`ab4c0aad-da5b-4200-b612-05bd8e29048b`) com `last_message_at <= 2026-07-07 23:59:59 -03` que atualmente estão em `active`.

## SQL

```sql
UPDATE public.whatsapp_conversations
SET status = 'closed', updated_at = now()
WHERE company_id = 'ab4c0aad-da5b-4200-b612-05bd8e29048b'
  AND status = 'active'
  AND last_message_at <= '2026-07-08 02:59:59+00';  -- 07/07 23:59:59 BRT
```

Nada além disso — sem tocar em arquivos, migrações ou outras empresas. Executado via ferramenta de insert/update de dados.
