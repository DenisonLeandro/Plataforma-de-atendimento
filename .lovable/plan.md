## Diagnóstico

Olhando os dados ao vivo:

- Logo após você tentar enviar para o Lucas (instância `advocacia-denison`), o status no banco mudou de `connected` → `connecting` (13:13:16). O mesmo aconteceu com `advocacia-ibipora` em 13:13:37.
- Os logs do `send-whatsapp-message` mostram a Evolution respondendo `400 Bad Request - "Error: Connection Closed"` no endpoint `/message/sendText/advocacia-denison`.

Ou seja: **a plataforma não está derrubando a conexão**. Ela só está refletindo o que a Evolution informa. A Evolution diz que a instância está `open` no `connectionState`, mas o socket Baileys interno **já estava morto antes do envio** — quando o `sendText` tenta usar o socket, ele lança "Connection Closed", e nosso código (corretamente) marca como `connecting` e tenta reabrir.

Isso é um bug clássico da Evolution self-hosted (issues #1286, #1799, #2364, #2403 do repo evolution-api): instância aparece como `open`, mas o socket Baileys caiu silenciosamente porque a versão do WhatsApp Web mudou (`CONFIG_SESSION_PHONE_VERSION` desatualizada), ou porque o WhatsApp do celular forçou logout, ou porque a Evolution está atrás de proxy/restart.

## Por que parece que "envio derruba a conexão"

1. Você abre a conversa: status = `connected` (cache do banco, baseado no último check).
2. Você manda mensagem → `sendText` é a primeira operação que de fato usa o socket → o Baileys descobre que está morto e devolve "Connection Closed".
3. Nosso código marca como `connecting` e dispara um `/instance/connect`.
4. Você vê: "envio falhou e desconectou".

A conexão já estava quebrada antes; só o envio expôs isso.

## Plano (sem mudar comportamento, só investigar e instrumentar para confirmar)

1. **Adicionar logs detalhados em `send-whatsapp-message`**
   - Logar o `connectionState` da Evolution **antes** do envio.
   - Logar o `connectionState` **depois** do erro (para confirmar que o socket já estava morto).
   - Logar se o `/instance/connect` de recuperação devolveu QR (= sessão expirou) ou só reabriu (= socket flapando).

2. **Adicionar um endpoint de diagnóstico** `diagnose-instance` que retorna:
   - `connectionState` cru da Evolution
   - `instance/fetchInstances` (mostra `owner`, `profileName`, `lastDisconnect`, `disconnectReason`)
   - status no nosso banco
   - últimos `consecutive_failures` do metadata
   Você roda isso em uma instância "conectada" sem enviar nada e a gente vê se a Evolution já mente sobre o estado.

3. **Botão "Diagnosticar" no card da instância** (junto de Testar/Reconectar) que chama esse endpoint e mostra o resultado num dialog — pra você ter visibilidade clara do que a Evolution está dizendo de verdade, sem precisar abrir log.

4. **Documentar a correção definitiva** (server-side, fora da plataforma)
   - Atualizar `CONFIG_SESSION_PHONE_VERSION` na stack da Evolution para a versão atual do WhatsApp Web (Configurações → Ajuda no WhatsApp Web mostra). Esta é a causa mais comum e relatada como solução em vários issues.
   - Garantir que o WhatsApp do celular não está com "Aparelhos Conectados" expirando a sessão.
   - Se usa proxy global, revisar.

## O que **não** vou mudar agora

- A função de envio já tenta recuperar 1x; não vou adicionar fila/retry agressivo enquanto não confirmarmos com o diagnóstico se é socket flapando (recuperável) ou sessão expirada (precisa QR).

## Arquivos afetados

- `supabase/functions/send-whatsapp-message/index.ts` (mais logs)
- `supabase/functions/diagnose-instance/index.ts` (novo)
- `src/components/settings/InstanceCard.tsx` (botão Diagnosticar + dialog)
- `src/hooks/whatsapp/useWhatsAppInstances.ts` (mutation `diagnoseInstance`)