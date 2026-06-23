## Encerrar conversas antigas — Cinco Conjuntos

Vou encerrar em massa todas as conversas ativas da instância **Advocacia Cinco Conjuntos** cuja última mensagem é do dia **19/06/2026** ou anterior (horário de Brasília).

### O que será feito
- Marcar **96 conversas** atualmente "ativas" como **encerradas** (status `closed`).
- Filtro: `instance_id = a369a4f6-f7e4-41c3-a80b-d03e2248fa76` e `last_message_at < 20/06/2026 00:00 (BRT)`.
- Conversas já encerradas e arquivadas não são tocadas.
- Conversas novas (de 20/06 em diante) permanecem ativas.

### Observações
- A ação é apenas uma atualização de status no banco — nenhuma mensagem é apagada e a conversa pode ser reaberta depois pelo menu da conversa.
- Não altero código nem regras do app; é uma operação pontual de limpeza.

### SQL (detalhe técnico)
```sql
UPDATE whatsapp_conversations
SET status = 'closed', updated_at = now()
WHERE instance_id = 'a369a4f6-f7e4-41c3-a80b-d03e2248fa76'
  AND status = 'active'
  AND last_message_at < '2026-06-20 03:00:00+00';
```
