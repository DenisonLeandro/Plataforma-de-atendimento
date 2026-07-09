## Diagnóstico

Empresa "Piscinas Ibipora" tem 218 conversas `active` e 742 `closed`. O status no banco está sendo gravado corretamente quando o atendente encerra — porém, o `evolution-webhook` **reabre automaticamente** qualquer conversa `closed` assim que chega qualquer nova mensagem (do cliente **ou** do próprio atendente). Como essa instância tem tráfego alto, o cliente responde logo após o encerramento e a conversa volta para "Ativas" — dando a impressão de que "encerrar não funciona".

Trechos responsáveis em `supabase/functions/evolution-webhook/index.ts`:
- **Linha 533**: ao localizar a conversa existente na criação, se estiver `closed` e a mensagem for do cliente, faz `UPDATE status='active'` e reaplica auto-atribuição.
- **Linhas 1050-1053**: no processamento de mensagem recebida, se `currentConv.status === 'closed'`, força `updateData.status = 'active'`.
- **Linhas 1066-1068**: mesma coisa para mensagens `fromMe` (echo do WhatsApp) — isso é ainda mais problemático, porque qualquer eco de mensagem antiga reabre a conversa.

Não é bug específico da Dom Piscinas — é comportamento global. Só ficou visível lá por causa do volume de mensagens.

## Plano de correção

### 1. Remover a reabertura automática no webhook
Editar `supabase/functions/evolution-webhook/index.ts`:
- Remover o bloco 533-544 (mantém apenas `return existingConversation.id`).
- Remover as atribuições `updateData.status = 'active'` em 1050-1053 e 1066-1068.
- Manter atualizações normais de `last_message_at`, `unread_count`, `last_message_is_from_me` — a conversa continua recebendo mensagens no histórico, apenas não muda de status.

### 2. Comportamento resultante
- Encerrar conversa = conversa permanece `closed` indefinidamente.
- Novas mensagens do cliente ainda são gravadas na tabela `whatsapp_messages` e a conversa continua visível no filtro "Encerradas" com `last_message_at` atualizado e `unread_count` incrementado.
- Para voltar a atender, o atendente usa manualmente **Reabrir conversa** no menu do header (`ChatHeaderMenu` já tem essa ação).

### 3. Limpar estado atual da Piscinas Ibipora
Rodar uma migração pontual: fechar novamente as conversas da Piscinas Ibipora que foram reabertas automaticamente após a última ação de encerramento manual (não temos histórico de "quando foi fechada", então critério prático: fechar todas com `last_message_at < now() - interval '1 hour'` que estão `active` e não têm `assigned_to`). Alternativamente, deixar a limpeza para o usuário disparar caso queira (mais seguro).

Sugestão: **não** rodar limpeza em massa agora — apenas corrigir o comportamento. Se depois o usuário quiser encerrar em lote por data (como já foi feito antes), fazemos isso num passo separado.

### 4. Nada muda em
- Frontend (`ChatHeaderMenu`, `useWhatsAppActions.closeConversation`) — já grava `closed` corretamente.
- RLS, tabelas, cron jobs.
- Filtros da sidebar — já separam `active`/`closed`/`archived`.

## Detalhes técnicos

- Escopo: 1 arquivo (`supabase/functions/evolution-webhook/index.ts`), 3 blocos removidos.
- Deploy automático da edge function.
- Sem migração de banco.
- Teste manual pós-deploy: encerrar uma conversa da Piscinas → pedir para o cliente enviar mensagem → confirmar que a conversa continua em "Encerradas" com badge de não-lida, e não pula para "Ativas".
