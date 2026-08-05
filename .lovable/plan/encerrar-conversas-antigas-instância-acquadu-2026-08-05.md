# Encerrar conversas antigas — instância Acquadu

## Situação atual (verificada no banco)
Na instância **Acquadu** existem hoje **287 conversas em aberto**:
- **1** com mensagem a partir de 05/08 00:00 (horário de Brasília)
- **286** com última mensagem anterior a essa data (ou sem mensagem)

Ou seja, o encerramento em massa ainda não foi aplicado no banco.

## O que será feito
Encerrar (status "closed") as **286 conversas** da instância Acquadu cuja última mensagem é anterior a 05/08/2026 00:00 (Brasília), mantendo abertas apenas as conversas com atividade a partir dessa data.

- Conversas sem data de última mensagem também serão encerradas (são conversas sem atividade).
- Conversas já encerradas ou arquivadas não são tocadas.
- Nenhuma mensagem, contato ou histórico é apagado — apenas o status muda.
- Se uma nova mensagem chegar depois, a conversa permanece encerrada (a reabertura automática está desativada nesta empresa); é possível reabrir manualmente pelo menu do chat.

## Detalhes técnicos
Atualização de dados em `public.whatsapp_conversations`:
- filtro: `instance_id = 6d5c6a9c-9bbe-4587-8aac-a277ffa8bca5`, `status = 'active'`, `last_message_at < '2026-08-05 00:00 America/Sao_Paulo'` ou `last_message_at IS NULL`
- alteração: `status = 'closed'`, `updated_at = now()`

Nenhuma alteração de código ou de schema é necessária.
