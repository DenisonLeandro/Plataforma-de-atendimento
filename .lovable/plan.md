## O que aconteceu (causa raiz)

Verifiquei o log da requisição que você fez no botão "Testar conexão" da instância **cinco-conjuntos**. A Evolution respondeu **com sucesso**:

```json
{ "instance": { "instanceName": "cinco-conjuntos", "state": "connecting" } }
```

Ou seja: a instância **não desconectou no Evolution**. Ela estava no estado `connecting` (Baileys reconectando — algo que acontece naturalmente por alguns segundos quando o WhatsApp renova o socket). O Evolution continuou funcionando.

O que falhou foi a **nossa lógica de mapeamento de status** nas edge functions. Encontrei dois bugs:

### Bug 1 — `test-instance-connection/index.ts` (linhas 140-145)
```ts
let newStatus = 'disconnected';
if (!responseText || data.state === 'open' || data.instance?.state === 'open') {
  newStatus = 'connected';
} else if (data.state === 'connecting') {        // <-- só checa data.state
  newStatus = 'connecting';
}                                                   // <-- não checa data.instance?.state
```
O self-hosted devolve `{ instance: { state: 'connecting' } }`, não `{ state: 'connecting' }`. O `else if` nunca casa, cai no default `disconnected` e grava no banco. **Foi exatamente isso que pintou todas as suas instâncias como "disconnected" quando você clicou em testar.**

### Bug 2 — `check-instances-status/index.ts` (cron periódico)
- A mesma falta de `data.instance?.state` para `connecting`.
- Pior: se a Evolution devolver **qualquer erro HTTP** (5xx, timeout, 502 do proxy), o código marca a instância como `disconnected` imediatamente. Uma única falha transitória derruba o status mesmo com WhatsApp 100% conectado.
- Não há tolerância: 1 falha = disconnected.

### Bug 3 — sem "trava de segurança"
Quando o webhook `connection.update` da Evolution chega com `state: 'open'`, atualizamos para `connected` (isso funciona). Mas o cron/teste pode sobrescrever de volta para `disconnected` na próxima checagem com bug — voltando para o início.

## Plano para corrigir (e nunca mais acontecer)

### 1. Corrigir mapeamento em ambas as funções
Arquivos: `supabase/functions/test-instance-connection/index.ts` e `supabase/functions/check-instances-status/index.ts`.

Trocar por um helper único que cobre todos os formatos da Evolution:
```ts
function mapEvolutionState(data: any): 'connected' | 'connecting' | 'disconnected' {
  const s = data?.state ?? data?.instance?.state;
  if (s === 'open' || s === 'connected') return 'connected';
  if (s === 'connecting') return 'connecting';
  if (s === 'close' || s === 'closed') return 'disconnected';
  return 'disconnected';
}
```

### 2. Tolerância a falhas transitórias no cron
Em `check-instances-status`:
- Erro HTTP da Evolution **NÃO** marca mais `disconnected` na hora.
- Em vez disso, incrementa um contador `metadata.consecutive_failures` na própria linha de `whatsapp_instances`.
- Só marca `disconnected` quando atinge **3 falhas consecutivas**.
- Qualquer resposta `open`/`connecting` zera o contador.

### 3. Estado `connecting` não derruba `connected`
Em `test-instance-connection` e no cron:
- Se a Evolution responder `connecting` **e** o status atual no banco for `connected`, **mantém `connected`** (apenas registra um log). `connecting` é um estado intermediário normal do Baileys e durar < 30s não significa que caiu.
- Só vira `connecting` no banco se o estado anterior já era `disconnected` (aí faz sentido mostrar "tentando reconectar").

### 4. Botão "Testar conexão" mais resiliente no front
Arquivo: provavelmente `src/components/settings/InstanceCard.tsx` (vou confirmar ao implementar).
- Hoje o botão chama uma vez e mostra o resultado imediato.
- Vou trocar para: chama, se vier `connecting`, faz mais 2 tentativas com 2s de intervalo. Só reporta "desconectado" se as 3 vierem ruins. Isso evita o falso negativo do estado transitório.

### 5. Botão "Reconectar" sem precisar excluir a instância
Vou adicionar (no `InstanceCard`) um botão **"Reconectar"** que chama o endpoint `POST /instance/connect/{instance}` da Evolution via uma nova edge function `reconnect-instance`. Isso força o Baileys a reabrir o socket — resolve a maior parte dos casos onde a instância "trava" em `connecting` sem precisar gerar QR novo.

## O que NÃO vou mexer

- Lógica de envio (`send-whatsapp-message`) — está correta, ela só repassa o erro da Evolution.
- Webhook (`evolution-webhook`) — já está mapeando os estados corretamente.
- Esquema do banco — `metadata` já é JSONB, cabe o contador sem migration.

## Como você vai resolver no futuro quando aparecer "desconectado"

1. Clicar em **Testar conexão** → com a tolerância nova, se Evolution estiver `connecting`, o botão espera estabilizar e mostra o status real.
2. Se mesmo assim ficar `disconnected`, clicar em **Reconectar** (botão novo) → força o socket sem perder a sessão.
3. Só se isso falhar, gerar QR Code novo (último recurso, como hoje).

## Detalhes técnicos (resumo dos arquivos)

- `supabase/functions/test-instance-connection/index.ts` — usa `mapEvolutionState`, não rebaixa `connected→disconnected` em estado `connecting`.
- `supabase/functions/check-instances-status/index.ts` — idem + contador de falhas consecutivas em `metadata.consecutive_failures`.
- `supabase/functions/reconnect-instance/index.ts` — **novo**, chama `POST {api_url}/instance/connect/{identifier}`.
- `src/components/settings/InstanceCard.tsx` — retry no teste + botão Reconectar.
- `src/hooks/useInstanceStatusMonitor.ts` — só ajustar se necessário para refletir o novo fluxo.

Sem migration, sem mudança de schema, sem mudança em RLS.
