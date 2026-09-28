# Corrigir mensagens que ficam "presas" em um check (conversa Escritório São Lourenço)

## O que está acontecendo (confirmado nos dados)
Não é um problema da conta da Eduarda. A diferença está no **endereço de WhatsApp usado para enviar**:

- Mensagens da Danielle (e anteriores) foram enviadas para o número normal `554399948408@s.whatsapp.net` e chegaram (lidas).
- A mensagem da Eduarda de hoje às 11:34 foi enviada para um endereço interno do WhatsApp (`231468689293369@lid`). O WhatsApp aceitou no servidor (1 check cinza), mas não entregou ao celular.

Isso acontece porque a regra que escolhe o destino passou a dar prioridade máxima a esse endereço interno ("@lid"), pois ele aparece nas confirmações de leitura das mensagens anteriores. Ou seja: qualquer pessoa que enviasse agora nessa conversa teria o mesmo problema — calhou de ser a Eduarda a primeira após a mudança.

## O que vou fazer
1. **Priorizar o número normal**: quando já houve envio entregue/lido para o número `@s.whatsapp.net`, ele passa a ser a primeira opção; o endereço interno "@lid" fica só como alternativa.
2. **Não promover "@lid" só por aparecer na confirmação de leitura** — só usá-lo primeiro quando o próprio envio para ele tiver sido entregue.
3. **Reenvio automático**: se uma mensagem enviada ficar só em "enviado" (1 check) por mais de ~2 minutos enquanto o destino era "@lid", reenviar pelo número normal e marcar a rota que funcionou para a conversa.
4. Publicar a função de envio e pedir para a Eduarda reenviar a mensagem do ABILIO JOSÉ FERREIRA (ou reenvio eu mesmo pela nova rota, se preferir).

## Detalhes técnicos
- `send-whatsapp-message/resolveDestinationCandidates`: remover `successfulAckLid`/`contactMetadata.lid` da lista de alta prioridade; colocar primeiro `remote_jid` @s.whatsapp.net de mensagem de saída com status delivered/read; @lid vira fallback.
- Gravar `preferred_send_jid` na conversa apenas quando chegar ACK DELIVERY/READ para o JID efetivamente usado (em `evolution-webhook`).
- Reenvio de mensagens "sent" presas em @lid: checagem na próxima execução de `retry-pending-media` (ou similar) com limite de 1 tentativa.
