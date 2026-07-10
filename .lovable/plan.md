## Ação

Encerrar em lote todas as conversas da instância **Advocacia Ibiporã** (`47090649-e7bb-46f4-9089-6c108d3cfb4b`) cuja última mensagem seja **até 09/07/2026 23:59:59 (America/Sao_Paulo)** e que ainda estejam abertas.

## SQL

```sql
UPDATE public.whatsapp_conversations
SET status = 'closed', updated_at = now()
WHERE instance_id = '47090649-e7bb-46f4-9089-6c108d3cfb4b'
  AND status <> 'closed'
  AND last_message_at <= '2026-07-10 02:59:59+00';  -- 09/07 23:59 BRT
```

Executo primeiro um `SELECT COUNT(*)` com o mesmo filtro para te confirmar quantas serão afetadas, e em seguida o `UPDATE`.

## Detalhe técnico

- Apenas a coluna `status` muda; conteúdo, mensagens e atribuições permanecem.
- Conversas com atividade em **10/07** em diante são preservadas.
- Se um cliente responder depois, a conversa reabre automaticamente (config `auto_reopen_on_inbound = true` está ligada para a Advocacia).