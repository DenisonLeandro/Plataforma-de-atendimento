## Diagnóstico da instância "Escritório Virtual"

Analisei sem alterar nada.

### O que está acontecendo

A instância está **conectada de verdade** na Evolution:

- Banco: `connected`
- Evolution: `state = open`
- Perfil conectado: `Maria Angelica`
- Número da instância: `554399776600`

Mas os envios feitos pela plataforma continuam falhando porque a requisição está indo para a Evolution com o **destino em formato errado/incompleto** em alguns contatos.

### Evidência principal

Nos envios que falham, a plataforma salva/enfileira a mensagem usando `remote_jid` apenas como número puro:

```text
5543999948455
5541991322900
554288919751
558287512346
```

A Evolution aceita o envio inicialmente, cria um `message_id`, mas logo em seguida devolve:

```text
messages.update -> status: ERROR
```

Exemplo recente:

```text
Mensagem: "Denison: opa"
Destino salvo pela plataforma: 5543999948455
Evolution retorna: status ERROR
```

Já as mensagens que funcionaram na mesma conversa apareceram com o destino completo:

```text
554399948455@s.whatsapp.net
```

e receberam status corretos:

```text
SERVER_ACK -> DELIVERY_ACK -> READ
```

Ou seja: **a conexão voltou**, mas o envio pela plataforma está escolhendo um identificador de destino diferente do identificador que a própria Evolution/WhatsApp está usando para a conversa.

### Por que reconectar não resolveu

Reconectar resolveu a sessão, mas não corrige o erro de roteamento do contato.

Também encontrei eventos de desconexão `401` antes da reconexão:

```text
state: close
statusReason: 401
message: Log out instance: escritorio-virtual
```

Depois disso a instância voltou para `open`, porém os envios pela plataforma ainda usam o número salvo antigo em algumas conversas, enquanto os eventos reais do WhatsApp chegam com outro JID.

### Situação atual nos últimos envios

Nos últimos dados da instância:

- 11 mensagens enviadas pela plataforma ficaram `failed`
- 5 mensagens da mesma instância tiveram confirmação `read`
- As que funcionam usam JID completo `@s.whatsapp.net`
- As que falham usam número puro salvo no contato/conversa

### Causa provável

O problema não é mais "instância desconectada".

A causa provável agora é uma inconsistência entre:

1. `phone_number` salvo no contato
2. `remote_jid` real recebido pela Evolution
3. número alternativo/LID retornado nos eventos do WhatsApp
4. payload montado em `send-whatsapp-message`

O código atual monta o destino assim:

```text
contact.phone_number.replace(/\D/g, '')
```

Isso perde o sufixo correto (`@s.whatsapp.net`) e ignora o `remoteJid` real usado pela Evolution.

## Plano de correção proposto

### 1. Corrigir o destino usado no envio

No `send-whatsapp-message`, em vez de enviar sempre o número limpo do contato, a função deve escolher o melhor destino nesta ordem:

1. `remote_jid` confiável da última mensagem da conversa com `@s.whatsapp.net`
2. `remote_jid` confiável da última mensagem recebida da conversa
3. `phone_number` se já tiver `@s.whatsapp.net` ou `@lid`
4. número limpo apenas como último fallback

Isso evita que mensagens sejam enviadas para um identificador que a Evolution rejeita logo depois.

### 2. Salvar o JID correto quando o webhook receber mensagens

Quando a Evolution enviar `messages.upsert` ou `messages.update`, atualizar o contato/conversa com o JID real usado:

```text
remoteJid: 554399948455@s.whatsapp.net
remoteJidAlt: 554399948455@s.whatsapp.net
```

Sem sobrescrever nomes ou números bons, apenas guardar esse identificador como referência técnica.

### 3. Marcar falhas de ack com motivo claro

Quando a Evolution devolver `status: ERROR`, salvar no metadata da mensagem:

```text
evolution_ack_error
remoteJid usado
keyId
```

Assim a plataforma mostra que o envio chegou na Evolution, mas foi recusado no ack final.

### 4. Opcional: reenviar as mensagens recentes depois da correção

Depois da correção, posso tentar reenviar apenas as mensagens recentes com `failed` da instância "Escritório Virtual".

Eu não recomendo fazer retry automático sem confirmação, para evitar mensagens duplicadas caso alguma tenha chegado no WhatsApp real apesar do erro.

## Resultado esperado

Após aplicar isso:

- A instância conectada deve conseguir enviar pela plataforma usando o mesmo JID que o WhatsApp/Evolution usa.
- O ponto de exclamação deve parar para casos em que a falha era causada por destino incorreto.
- Se ainda houver `ERROR`, ficará claro se é bloqueio/sessão/WhatsApp, e não erro genérico da plataforma.