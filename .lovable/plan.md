# Diagnóstico — instância "Escritório Virtual" não envia (⚠️ ponto de exclamação)

## O que descobri (análise read-only)

Rastreei as 3 tentativas de envio feitas hoje (13/07 às 13:39:34, 13:39:41 e 13:39:45) e o comportamento é **igual nas três**:

1. Nosso `send-whatsapp-message` chama `/message/sendText` na Evolution API e recebe **200 OK** com um `key.id` válido (`3EB01300AF41FF660163CB`, `3EB0AA90...`, `3EB00CB6...`). Log confirma: `Message sent and saved`.
2. A mensagem é gravada no banco com `status='sent'`.
3. **Poucos milissegundos depois**, a Evolution manda um webhook `messages.update` para cada uma dessas mensagens com este payload:

```json
{
  "event": "messages.update",
  "instance": "escritorio-virtual",
  "data": {
    "keyId": "3EB01300AF41FF660163CB",
    "remoteJid": "554699817679@s.whatsapp.net",
    "fromMe": true,
    "status": "ERROR"     // ← Evolution está dizendo que falhou
  }
}
```

4. Nosso webhook faz o que deve: mapeia `status: "ERROR"` → `'failed'` e marca a mensagem com o ponto de exclamação vermelho.

**Conclusão:** o problema **não é da plataforma**. A Evolution aceita a requisição, mas o socket Baileys da instância `escritorio-virtual` não consegue efetivamente entregar a mensagem ao WhatsApp e reporta ERROR no ack. Isso acontece com todas as conversas (3 números diferentes, 3 ERRORs seguidos), o que descarta problema de contato específico e aponta para **saúde da sessão da instância**.

O DB ainda diz `status='connected'` porque o último `connection.update` foi `open` (01:35 de hoje) — mas o socket interno do Baileys degradou depois disso sem emitir novo `connection.update`. Já vimos esse padrão antes (o famoso "Connection Closed" silencioso).

## Causa provável (do lado do WhatsApp/Evolution, não do código)

- Sessão multi-device expirada / invalidada pelo WhatsApp.
- Celular pareado ficou muito tempo sem abrir o WhatsApp → sessão pendurada.
- Instância recebeu logout do outro lado (celular desconectou os dispositivos).
- Rate-limit / anti-spam do WhatsApp para esse número.

O envio via app do celular provavelmente também está falhando ou o número perdeu o pareamento — isso precisa ser conferido no aparelho.

## Ação imediata (fora do código, feita pelo Denison/dono da conta)

1. Abrir Configurações → Instâncias → **Escritório Virtual** → clicar em **"Reconectar"**.
2. Se aparecer QR Code, ler novamente com o WhatsApp do celular.
3. Se não aparecer QR e continuar com ERROR, **remover a instância no celular** (WhatsApp → Aparelhos conectados → desconectar) e reparear via QR.

## Plano de correção na plataforma (para a próxima vez esse cenário não passar despercebido)

Faremos 3 melhorias, todas de baixo risco:

### 1. Detectar "ERROR em rajada" e sinalizar a instância como degradada

Em `supabase/functions/evolution-webhook/index.ts` (`processMessageUpdate`): quando mapear para `'failed'`, incrementar um contador por instância (janela de 5 min). Se ≥ 3 ERRORs em 5 min, forçar `whatsapp_instances.status = 'connecting'` e disparar um `connection.update` fake para o front acordar o banner "Reconectar".

### 2. Guardar o motivo do erro na mensagem

Hoje o balão fica com ⚠️ sem contexto. Vou salvar `metadata.error = 'evolution_ack_error'` (e o `keyId`) para que o `MessageBubble` mostre um tooltip: *"Evolution reportou erro no envio — reconecte a instância"*.

### 3. Toast diferenciado + botão "Reconectar agora"

Em `src/hooks/whatsapp/useWhatsAppSend.ts` — quando o envio for aceito e o webhook virar `failed` em ≤10s (via Realtime na mensagem otimista), disparar um toast destrutivo com ação *"Reconectar instância"* que leva direto para `/whatsapp/settings`.

## Detalhes técnicos

- Nada muda no fluxo de sucesso (não impacta as outras instâncias que estão saudáveis).
- Não alteramos `send-whatsapp-message` — o comportamento dele está correto.
- A regra monotônica de `advanceMessageStatus` já protege: `failed` sobrescreve `sent`, mas nunca sobrescreve `read`/`delivered` sem querer.
- A detecção de rajada usa `whatsapp_webhook_events` (já temos janela de tempo e `instance_identifier`).

## Fora do escopo

- **Não vou** mudar a lógica de retry automático do envio (isso pode gerar mensagens duplicadas quando o socket volta).
- **Não vou** reconectar a instância automaticamente sem clique do usuário (política antiga do projeto, para evitar QR indesejado).
- **Não vou** reprocessar as 3 mensagens já `failed` — o usuário decide se reenvia manualmente.  
  
tente mesmo assim, enviar as 3 mensagens