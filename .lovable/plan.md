# Evolution voltou — validação + melhorias de resiliência

Confirmado agora: `https://evolution-api-hbbv.srv1746890.hstgr.cloud/` respondeu **HTTP 200 em 450ms**. O servidor externo está de pé de novo, então envio e webhooks já devem funcionar normalmente.

## 1. Validação imediata (sem código)
- Testar `connectionState` das 3 instâncias (Advocacia Ibiporã, Advocacia Denison, Piscinas Ibiporã) pela função `test-evolution-connection`.
- Qualquer instância que voltar em `connecting`/`close` → botão **Reconectar** no card.
- Você envia 1 mensagem de teste em cada empresa para confirmar ponta-a-ponta.

## 2. Melhorias de UI para o próximo incidente (código)
Objetivo: quando a Evolution cair de novo, o usuário entende na hora — sem toast genérico "Falha ao enviar".

### 2a. Banner global "Servidor WhatsApp indisponível"
- Novo componente `EvolutionHealthBanner` no topo do `ChatArea`.
- Consulta leve a cada 60s: chama uma nova edge function `check-evolution-health` que faz `GET /` no host da Evolution da instância selecionada com timeout de 5s.
- Mostra banner vermelho fixo **apenas** quando **todas** as instâncias da empresa estão inacessíveis: *"Servidor WhatsApp fora do ar — envio e recebimento temporariamente indisponíveis. Nenhuma ação necessária na plataforma."*

### 2b. Toast específico por tipo de erro no envio
Atualmente `send-whatsapp-message` já devolve `code: 'CONNECTION_CLOSED'` vs `'EVOLUTION_ERROR'`. Vou adicionar:
- `code: 'EVOLUTION_UNREACHABLE'` quando o `fetchWithTimeout` estourar (timeout de rede, não erro HTTP).
- No frontend (`useWhatsAppSend`), mapear cada code para uma mensagem clara em pt-BR:
  - `EVOLUTION_UNREACHABLE` → "Servidor WhatsApp fora do ar. Tente novamente em alguns minutos."
  - `CONNECTION_CLOSED` → texto atual (reconectar instância).
  - `EVOLUTION_ERROR` → texto atual.

### 2c. Log estruturado por instância
- Em `send-whatsapp-message`, prefixar todo log com `[instance=<name>]` para facilitar filtrar por instância nos logs de edge function em incidentes futuros.

## O que **não** faz parte do plano
- Não vou mexer em RLS, schema, webhooks recebidos, nem em lógica de auto-reopen — nada disso quebrou; só houve indisponibilidade externa.
- Não vou tocar em `evolution-webhook` (o receptor): quando a Evolution está no ar, os webhooks já chegam.

## Escopo técnico resumido
- **Novo:** `supabase/functions/check-evolution-health/index.ts` (GET, retorna `{ reachable: boolean, latencyMs }` por instância da empresa).
- **Novo:** `src/components/notifications/EvolutionHealthBanner.tsx` + montagem no layout do WhatsApp.
- **Editar:** `supabase/functions/send-whatsapp-message/index.ts` (adicionar `EVOLUTION_UNREACHABLE`, prefixo de log).
- **Editar:** `src/hooks/whatsapp/useWhatsAppSend.ts` (mapear codes para mensagens específicas).

## Passo a passo sugerido
1. Você confirma que o envio manual voltou nas 3 instâncias.
2. Se sim, sigo com 2a + 2b + 2c num único build.
3. Se alguma instância ainda estiver `connecting`, corrijo pela plataforma antes de tocar em código.
