
## Contexto verificado

Consultei o banco:

- `Advocacia Maringa` (maringa) → status = `connecting`, metadata `{}`, atualizado às 13:51
- `Advocacia Ibiporã` (advocacia-ibipora) → status = `connecting`, metadata `{}`, atualizado às 13:51
- `Piscinas Ibiporã` → `connected` (OK)

Ambas as instâncias travadas são `provider_type = self_hosted` e **não** têm `delivery_degraded` no metadata nem falhas de envio recentes (0 mensagens falhadas nos últimos 5 min, 0 mensagens em 10 min). Ou seja, o "reconectando" não veio do fluxo de "delivery degraded" — veio de o `mapEvolutionState()` ter retornado `connecting` em uma verificação, e a lógica atual do `check-instances-status` mantém esse estado enquanto `currentStatus !== 'connected'`.

Como no Evolution as duas estão de fato conectadas, precisamos: (1) destravar agora, (2) endurecer a lógica pra não ficar preso em `connecting` por transientes.

## Passos

### 1. Diagnóstico ao vivo (read-only) — confirmar o que a Evolution devolve
Antes de mexer, chamar `test-instance-connection` (ou olhar log) para as duas instâncias e confirmar que o Evolution devolve `state: open`. Isso valida a hipótese de que o problema é só o status local.

### 2. Destravar status agora
Rodar update pontual no banco:

```sql
UPDATE whatsapp_instances
SET status = 'connected',
    metadata = metadata - 'delivery_degraded' - 'delivery_degraded_reason' - 'recovery_hint' - 'consecutive_failures' - 'delivery_failure_count',
    updated_at = now()
WHERE id IN (
  '8e3ab02c-f180-45df-9834-cec8912940c5',
  '47090649-e7bb-46f4-9089-6c108d3cfb4b'
);
```

Isso libera envio e recebimento imediato (o webhook não é bloqueado por status, mas o envio pela UI e alguns fluxos consultam status).

### 3. Corrigir a lógica que prende em "connecting" (`supabase/functions/check-instances-status/index.ts`)
Ajustes:

- Quando `mapped === 'connecting'` e `currentStatus === 'connecting'`, incrementar um contador `connecting_streak` no metadata. Só manter `connecting` se `connecting_streak < 3`; caso contrário, tratar como conectado ou disconectado com base em uma nova verificação (ex.: se a Evolution devolveu 200 e não há falha de envio recente, promover para `connected`, já que `connecting` transiente do Baileys costuma durar segundos).
- Zerar `connecting_streak` sempre que `mapped === 'connected'`.
- Nunca marcar `connecting` só por causa de `delivery_degraded` quando não há falhas reais recentes de envio: a checagem `countRecentOutboundFailures` já cobre isso; garantir que o flag `delivery_degraded` no metadata seja limpo assim que `recentDeliveryFailures === 0`.

### 4. Mesmo ajuste em `test-instance-connection/index.ts`
Hoje, se `mapped === 'connecting'` e `currentStatus !== 'connected'`, ele grava `connecting`. Passar a promover para `connected` quando a Evolution responder 200 sem falhas de envio recentes, evitando que clicar em "Testar conexão" trave a instância em `connecting`.

### 5. Verificação final
- Rodar `check-instances-status` manualmente após o deploy.
- Confirmar que as duas instâncias ficam `connected`.
- Testar envio de mensagem em cada uma pela UI.

## Detalhes técnicos

- Arquivos alterados: `supabase/functions/check-instances-status/index.ts`, `supabase/functions/test-instance-connection/index.ts`.
- Migration SQL apenas para o UPDATE emergencial (passo 2).
- Nenhuma alteração de RLS, schema ou frontend.
- Deploy: redeploy das duas edge functions ao final.

## Fora de escopo

- Não vou mexer no `send-whatsapp-message` nem no `evolution-webhook` — eles não são a causa aqui.
- Não vou reconectar QR Code; as instâncias no Evolution já estão conectadas.
