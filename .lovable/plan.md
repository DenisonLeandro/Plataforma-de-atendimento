## Diagnóstico encontrado

A instância **Escritório Virtual** não está falhando por desconexão geral nem por ausência de webhook. O envio chega na Evolution, a Evolution aceita e gera o evento `send.message`, mas logo depois devolve `messages.update` com `status: ERROR`.

Nos dados recentes da conversa “Namorado”, existe um padrão claro:

- Antes das falhas, mensagens enviadas pelo WhatsApp real aparecem com sucesso usando `message_id` iniciado por `2A...` e `ack_remote_jid` como `...@lid`.
- As mensagens enviadas pela plataforma depois disso usam `message_id` iniciado por `3EB...`, passam pelo endpoint da Evolution, mas voltam como `ERROR`.
- O destino usado pela plataforma é `554399948455@s.whatsapp.net`, porém o WhatsApp real/Evolution também registra identificadores `@lid` para essa mesma conversa.
- O contato salvo tem telefone `5543999948455`, enquanto o JID técnico usado no envio recente é `554399948455@s.whatsapp.net`. Ou seja: há conflito entre telefone salvo, JID resolvido e LID da conversa.

Conclusão: para esta instância, o problema mais provável é **roteamento errado de destinatário/JID em conversas com LID**, não apenas sessão desconectada. A plataforma está reenviando para um identificador que a Evolution aceita, mas o WhatsApp rejeita na entrega.

## Plano de correção

1. **Corrigir a resolução do destinatário no envio**
   - Atualizar `send-whatsapp-message` para priorizar o identificador técnico mais confiável por conversa:
     - primeiro `conversation.metadata.resolved_phone_jid`, quando existir;
     - depois `conversation.metadata.last_remote_jid`;
     - depois `contact.metadata.resolved_phone_jid`;
     - depois `contact.metadata.last_remote_jid`;
     - depois JIDs de mensagens recentes bem-sucedidas;
     - por último o telefone do contato.
   - Para conversas LID, não escolher automaticamente um `@s.whatsapp.net` antigo se os ACKs recentes bem-sucedidos apontam para `@lid`.

2. **Persistir os identificadores corretos vindos do WhatsApp real**
   - Ajustar `evolution-webhook` para salvar, em mensagens/conversas/contatos:
     - `remote_jid` original;
     - `ack_remote_jid`;
     - `resolved_phone_jid`;
     - `lid` quando aparecer.
   - Isso evita que a plataforma perca o identificador correto quando a conversa tem telefone + LID.

3. **Corrigir os dados atuais da instância Escritório Virtual**
   - Fazer uma atualização pontual nos metadados da conversa/contato afetados, usando os dados já existentes nos webhooks e mensagens recentes.
   - Manter as mensagens antigas falhadas como falhadas para não reenviar duplicado automaticamente.

4. **Melhorar a detecção de erro de entrega**
   - Quando a Evolution retornar `ERROR`, salvar no metadado da mensagem:
     - destino usado no envio;
     - destino retornado pelo ACK;
     - motivo técnico;
     - sugestão de recuperação.
   - Isso vai permitir identificar rapidamente se a falha futura é sessão corrompida, número inválido ou conflito LID/JID.

5. **Implantar e validar**
   - Implantar `send-whatsapp-message` e `evolution-webhook`.
   - Testar a função de envio em uma conversa da instância Escritório Virtual usando o mesmo fluxo real da plataforma.
   - Confirmar nos logs se a Evolution deixa de retornar `ERROR` e se a mensagem passa para `sent/delivered/read`.

## Arquivos/funções que serão alterados

- `supabase/functions/send-whatsapp-message/index.ts`
- `supabase/functions/evolution-webhook/index.ts`
- Dados pontuais em `whatsapp_conversations` e `whatsapp_contacts` da instância Escritório Virtual, sem apagar mensagens.

## Resultado esperado

A instância **Escritório Virtual** deve voltar a enviar mensagens pela plataforma, usando o mesmo identificador técnico que o WhatsApp/Evolution usam para entregar mensagens nessa conversa, em vez de depender apenas do telefone salvo.