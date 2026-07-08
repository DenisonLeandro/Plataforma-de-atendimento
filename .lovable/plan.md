## Diagnóstico

Reproduzi o erro chamando a função `send-whatsapp-reaction` com uma mensagem real. O que a Evolution API retorna é OK (a reação **chega no WhatsApp do cliente**), mas depois disso a gravação no banco explode com:

```
there is no unique or exclusion constraint matching the ON CONFLICT specification
```

**Causa raiz:** o hook usa `.upsert({...}, { onConflict: 'message_id,user_id' })`, mas na migração anterior criei um **UNIQUE INDEX parcial** (`WHERE user_id IS NOT NULL`) — não uma constraint. O PostgREST (Supabase JS) exige uma UNIQUE constraint nomeada para o `onConflict`; índices parciais são ignorados e a operação falha. Resultado prático: a Evolution até envia a reação para o WhatsApp, mas nossa UI mostra "Erro ao reagir" e não guarda a reação, então ela também some da tela.

## Plano de correção

### 1. Trocar o upsert por SELECT + INSERT/UPDATE explícito
Na edge function `send-whatsapp-reaction`, substituir o bloco de upsert por:
1. `SELECT id FROM whatsapp_reactions WHERE message_id = ? AND user_id = ?`
2. Se existir → `UPDATE ... SET emoji = ?`
3. Se não → `INSERT ...`

Isso funciona com o índice parcial já existente (a proteção contra duplicidade continua garantida pelo índice) e não depende de `ON CONFLICT`.

### 2. Manter a checagem de sucesso da Evolution antes de gravar
A ordem atual (chama Evolution → grava no banco) permanece. Se a Evolution falhar, não gravamos e mostramos erro real.

### 3. Nada muda no frontend, webhook ou migração
- Hook `useMessageReaction` já invoca a função — sem alteração.
- Migração da tabela permanece (índices parciais estão corretos, só não são usáveis via `onConflict` do PostgREST).
- Webhook continua ignorando `fromMe=true` para não duplicar.

## Detalhes técnicos

- Escopo: só `supabase/functions/send-whatsapp-reaction/index.ts`.
- Nenhuma nova migração é necessária.
- Após aplicar, teste manual: reagir em uma mensagem → toast desaparece, reação aparece na plataforma e no WhatsApp do cliente.
