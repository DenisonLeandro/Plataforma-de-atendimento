Criar uma migration idempotente contendo exatamente dois CREATE INDEX IF NOT EXISTS na tabela public.whatsapp_conversations:

1. idx_conversations_status_last_message
   - Colunas: (status, last_message_at DESC NULLS LAST)
   - Finalidade: acelera filtros por status combinados com ORDER BY last_message_at DESC (uso principal em useWhatsAppConversations).

2. idx_conversations_instance_status
   - Colunas: (instance_id, status)
   - Finalidade: acelera filtros simultâneos por instância e status (caso comum da UI: ver "Encerradas" da instância X).

Regras seguidas:
- Uso de IF NOT EXISTS para idempotência.
- Nenhum índice existente é alterado.
- Nenhuma tabela, função, view ou política RLS é modificada.
- Sem VACUUM ou ANALYZE explícito.