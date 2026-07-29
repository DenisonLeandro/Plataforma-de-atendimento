## Problema

Quando a instância é desconectada no Evolution (estado `close`/`closed`), a plataforma continua marcando ela como **conectado**. Isso já foi confirmado agora com a instância de Ibiporã.

## Causa

Em `supabase/functions/check-instances-status/index.ts`, a lógica de decisão só rebaixa o status quando `currentStatus !== 'connected'`:

```ts
} else if (currentStatus !== 'connected') {
  newStatus = mapped;   // <- só cai aqui se JÁ não estivesse "connected"
}
```

Ou seja: se o banco diz `connected` e o Evolution passa a responder `close`, o código simplesmente ignora o `disconnected` retornado pelo mapeamento — o registro nunca é atualizado. O mesmo vale para `test-instance-connection`, que hoje força qualquer `connecting`/`connected` do Evolution para `connected` e nunca reduz para `disconnected` quando o Evolution já reporta socket fechado.

Esse comportamento foi introduzido nas correções anteriores para evitar que `connecting` transitório derrubasse a UI — mas ele passou a esconder desconexões reais.

## Correção proposta (backend, sem mudar UI)

### 1. `supabase/functions/check-instances-status/index.ts`
- Tratar `mapped === 'disconnected'` (Evolution reporta `close`/`closed`) de forma independente do estado atual:
  - Introduzir contador `disconnected_streak` em `metadata` (igual ao `connecting_streak`).
  - Ao receber `disconnected` do Evolution: incrementar contador; se `>= 2` checagens seguidas (≈ dois ciclos do cron), atualizar `status = 'disconnected'` mesmo que estivesse `connected`. Isso evita derrubar por um único flap, mas garante que uma desconexão real refletida por 2 leituras do Evolution vira `disconnected` na plataforma.
  - Zerar `disconnected_streak` quando voltar a `connected`.
- Manter a lógica atual de `connecting_streak` (transiente) sem mudança.
- Ao mudar para `disconnected`, limpar `qr_code` fica como está e preservar `delivery_degraded` já é feito.

### 2. `supabase/functions/test-instance-connection/index.ts`
- Quando o usuário clica em **Testar conexão** e o Evolution responde `close`/`closed` explicitamente, marcar `status = 'disconnected'` imediatamente (sem streak — é ação manual do usuário e o retorno é autoritativo).
- Continuar tratando `connecting` como `connected` só quando **não** há `delivery_degraded` (comportamento atual preservado).

### 3. Sem mudanças em
- `evolution-webhook` (já processa `connection.update` corretamente quando o Evolution envia o evento).
- Frontend / `useInstanceStatusMonitor` / `InstanceCard` — o realtime da tabela já reflete a mudança assim que o backend atualizar.
- Schema, RLS, cron, políticas.

## Como validar
1. Após o deploy, aguardar o próximo tick do `check-instances-status` (ou disparar manualmente pelo botão "Testar conexão" no card de Ibiporã).
2. Confirmar via `supabase--read_query` que `whatsapp_instances.status = 'disconnected'` para Ibiporã e que `metadata.disconnected_streak` foi zerado quando o usuário reconectar.
3. Reconectar no Evolution e verificar que o status volta para `connected` no próximo ciclo.

## Fora de escopo
- Alterar frequência do cron.
- Redesenhar o card de instância ou banners.
- Mudanças em envio/recebimento de mensagens.
