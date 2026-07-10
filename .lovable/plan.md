## Contexto

Boa parte da ETAPA 2 já está no código:
- `MessageBubble.tsx` já tem `getStatusIcon()` cobrindo `pending/sending/sent/delivered/read/failed` com `Clock`, `Check`, `CheckCheck`, `AlertCircle`.
- `useWhatsAppMessages.ts` já escuta `INSERT` **e** `UPDATE` via Realtime e faz merge no cache sem recarregar tudo.
- `useWhatsAppSend.ts` já cria a mensagem otimista com `status: 'sending'` (renderizada como `Clock`).

O que ainda **não** bate com a especificação:
1. Tamanho dos ícones é `w-3 h-3` (12px) — pedido é 14px.
2. Cores não seguem a paleta pedida (`#9CA3AF` / `#3B82F6` / `#EF4444`). Hoje: cinza usa `text-primary-foreground/70` (herda do balão laranja → fica branco em mensagens enviadas), `read` usa `text-blue-500`, `failed` usa `text-red-500`.
3. Fallback para `status` nulo/indefinido não está explícito (hoje cai no `default` = `Check` cinza herdado — funcional, mas vale deixar explícito).
4. Ícones aparecem só se `is_from_me` — já correto, manter.

## Mudanças (somente frontend)

### `src/components/chat/MessageBubble.tsx`
- Reescrever `getStatusIcon()` para:
  - Retornar `null` quando `!isFromMe`.
  - Usar `size={14}` em todos os ícones (via prop do lucide, mais preciso que classe).
  - Aplicar cor via `style={{ color: '#9CA3AF' }}` para `pending/sent/delivered` e fallback, `#3B82F6` para `read`, `#EF4444` para `failed`. Isso sobrepõe o `text-primary-foreground/70` do balão laranja e garante o cinza/azul/vermelho exatos em qualquer tema.
  - Mapa:
    - `sending` | `pending` → `Clock` cinza
    - `sent` → `Check` cinza
    - `delivered` → `CheckCheck` cinza
    - `read` → `CheckCheck` azul
    - `failed` → `AlertCircle` vermelho
    - default (null/undefined/desconhecido) → `Check` cinza
- Nenhuma outra mudança no layout, posição, espaçamento, cor de balão ou classe do horário.

### Nada mais é alterado
- `useWhatsAppMessages.ts` — já tem listener de `UPDATE`, sem mudança.
- `useWhatsAppSend.ts` — já emite estado otimista `sending`, sem mudança.
- Backend, RLS, edge functions, migrations — não tocar.
- Cor laranja do projeto — intocada.

## Validação

- `npm run build` deve continuar passando (mudança isolada a um componente).
- Verificação visual: enviar mensagem → Clock cinza → Check cinza (após insert) → CheckCheck cinza (delivered) → CheckCheck azul (read), tudo via Realtime sem reload.

## Entregável

Diff de `src/components/chat/MessageBubble.tsx` + confirmação do build. Sem commit/push até seu OK.