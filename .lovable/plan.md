## Visão geral
Duas frentes, sem regredir nada (paleta, Geist, grid 400/1fr/300, tokens):
1. **Lógica:** reabertura automática de conversas encerradas + estado `reopened` + timeline + badge temporário.
2. **Visual:** sistema unificado de botões premium (5 variantes, 4 tamanhos, loading) e badges semânticos não‑clicáveis; saneamento do menu de 3 pontinhos.

---

## PARTE 1 — Reabertura automática

### 1.1 Estados de conversa
Hoje `whatsapp_conversations.status` usa: `active | closed | archived`. Adicionar suporte (no app, sem mudar tipo da coluna — continua `varchar`) a:
- `reopened` — conversa estava `closed` e cliente enviou nova mensagem.

`waiting` permanece reservado para futuro (não cabe nessa iteração — sem gatilho claro). Não introduzir agora para evitar escopo.

### 1.2 Migration (opcional, leve)
Não precisa alterar schema (status é text). Apenas garantir índice já existente continua útil. **Nenhuma migration estrutural.**

### 1.3 Webhook — `supabase/functions/evolution-webhook/index.ts`
Função `processMessageUpsert`, bloco "Update conversation metadata" (~linha 831):
- Antes do update, ler também `status, assigned_to, metadata` da conversa atual (já lê `unread_count`, expandir o `select`).
- Se `!key.fromMe` **E** `currentConv.status === 'closed'`:
  - `updateData.status = 'reopened'`
  - `updateData.metadata = { ...currentMetadata, reopened_at: timestamp, reopened_by: 'system_auto', reopen_banner_dismissed: false, timeline: [...(currentMetadata.timeline||[]), { type:'reabertura_automatica', at: timestamp, trigger_message_id: key.id }] }`
- Se `key.fromMe` **E** `currentConv.status === 'reopened'`:
  - `updateData.status = 'active'` (atendente respondeu → expira o estado reaberto)
  - limpar `reopened_at` do metadata.

Notificação ao atendente atribuído: usar a tabela `whatsapp_conversations` já em `supabase_realtime` (cliente já escuta). Não criar canal novo nessa iteração — o `useNotifications` no app vai mostrar o ícone normal de não‑lida. Documentar no código que toast/push extra fica para próxima.

### 1.4 Hook de envio — `src/hooks/whatsapp/useWhatsAppSend.ts`
Após sucesso do `sendMessage`, se a conversa selecionada tem `status === 'reopened'`, atualizar para `active` e limpar `reopened_at` (mesma transição que o webhook faz). Garante consistência mesmo se a mensagem enviada não dispara webhook inbound.

### 1.5 Hook "marcar como lida"
Localizar onde `unread_count` é zerado ao abrir conversa (provavelmente em `useWhatsAppMessages`/`ChatArea`). Quando isso acontecer **E** `status === 'reopened'`, marcar `metadata.reopen_banner_dismissed = true` (não muda status — o status só vira `active` quando o atendente responde, conforme regra do briefing: "Quando o atendente abre a conversa (marca como lida)" expira o **badge**, não necessariamente o status). Para simplificar e respeitar literalmente o briefing: ao marcar como lida, badge some; ao responder, status volta a `active`; após 24h sem mensagem o badge também some (computado no client: `reopened_at + 24h < now`).

Regra final do badge "Reaberta" (computada no client):
```
showReopenedBadge = status === 'reopened'
  && !metadata.reopen_banner_dismissed
  && (now - reopened_at) < 24h
```

### 1.6 ChatHeaderMenu — `src/components/chat/ChatHeaderMenu.tsx`
- Esconder "Reabrir conversa" quando `status !== 'closed'` (hoje aparece como "Encerrar" no else, mas não trata `reopened`/`archived`). Ajustar para:
  - `closed` → mostrar "Reabrir conversa" (ícone `RotateCcw` na cor `--accent`, item de menu normal sem fundo laranja).
  - `active | reopened` → mostrar "Encerrar conversa" (item destrutivo).
  - `archived` → mostrar "Reabrir conversa".
- Quando reabertura é manual, gravar `metadata.reopened_by = 'manual'` e timeline `reabertura_manual` (estender `useWhatsAppActions.reopenConversation` para aceitar opcional `{ origin }`).

### 1.7 Badge na sidebar — `src/components/conversations/ConversationItem.tsx`
- Bloco "Status and Assignment row" (~linha 200): substituir `Badge` shadcn por `<StateBadge variant=...>` (componente novo, item 2.3 abaixo).
- Lógica de exibição:
  - `closed` → `badge-success` "Encerrada" com ícone `CheckCircle2`.
  - `archived` → `badge-neutral` "Arquivada".
  - `reopened` + `showReopenedBadge` → `badge-accent` "Reaberta" com ícone `RefreshCw 12px`.
  - `active` ou `reopened` expirado → nada.
- Sentiment emoji ao lado do nome continua emoji (não vira badge — emoji já é "badge informal").

### 1.8 Faixa de reabertura no topo do chat — `src/components/chat/ChatHeader.tsx`
Adicionar logo abaixo do header (antes do `MessagesContainer`, na verdade entre header e mensagens — vou colocar dentro de `ChatArea.tsx` para ficar acima de `MessagesContainer`):
- Banner sutil quando `showReopenedBadge`:
  ```
  ↻ Conversa reaberta automaticamente em {data} às {hora} — cliente enviou nova mensagem  [×]
  ```
- Fundo `--accent-soft`, texto `text-text-primary text-sm`, padding `10px 16px`, ícone `RefreshCw 14px` à esquerda, `X` à direita.
- Botão `×` chama mutation que seta `metadata.reopen_banner_dismissed = true`.
- Some automaticamente quando atendente envia mensagem (status vira `active`).

### 1.9 Filtros e contagens
- `useWhatsAppConversations`: garantir que a query default mostra `status IN ('active','reopened')` quando filtro = "all" (hoje filtra implicitamente — confirmar e ajustar). `statusFilter === 'all'` no `ConversationsSidebar` não passa filtro de status → todas aparecem. Manter assim, mas no `ConversationFiltersPopover` adicionar opção "Reabertas" ao select de status.
- `QuickFilterPills`: nenhum pill novo (briefing não pede).

### 1.10 Aceite Parte 1
- Cliente envia mensagem em conversa `closed` → `status` vira `reopened` no banco, badge "Encerrada" some do card e badge "Reaberta" aparece em laranja.
- Faixa informativa aparece no topo do chat, dispensável via `×`.
- Badge expira em 24h, ao marcar como lida (banner dismiss), ou ao responder (status → `active`).
- Botão "Reabrir conversa" no menu só aparece em `closed`/`archived`.
- Reabertura manual: `metadata.reopened_by = 'manual'` + timeline.
- `metadata.timeline` armazena `conversa_encerrada` (adicionar no `closeConversation`), `reabertura_automatica`, `reabertura_manual`.

---

## PARTE 2 — Sistema de botões e badges

### 2.1 Estender shadcn `Button` — `src/components/ui/button.tsx`
**Não criar componente paralelo**. Estender `buttonVariants` para mapear às 5 variantes do briefing usando tokens já existentes (`--brand-primary`, `--brand-primary-hover`, `--bg-surface`, `--border-subtle`, `--accent`, etc.):

Variants finais:
- `primary` (escuro — `--brand-primary`, hover `--brand-primary-hover`, sombra com inset 1px branca)
- `secondary` (default visual — fundo `--bg-surface`, borda `--border-subtle`, ícones `text-text-secondary` que ficam `text-text-primary` no hover) — **será o `defaultVariant`**
- `ghost` (transparente → hover `--bg-surface-2`)
- `accent` (`--accent` laranja, fontWeight 600, com sombra colorida) — **máx 1 por viewport**
- `destructive` (texto `#9A2122`, borda `rgba(197,41,42,0.20)`, hover suave) — substitui o destructive shadcn atual sem quebrar callsites
- Manter aliases retrocompatíveis: `default → primary`, `outline → secondary` (mantém renderização atual em todos callsites sem precisar trocar caso a caso).

Sizes finais:
- `sm` 30px / `md` (default) 36px / `lg` 40px / `icon` 36x36 / `icon-sm` 30x30
- Aliases: `default → md`, manter o atual.

Adicionar:
- `:active { transform: scale(0.97) }` via classe utilitária `active:scale-[0.97]`.
- Estado loading via prop `loading` (novo): renderiza um `<Loader2 className="animate-spin">` sobre o conteúdo invisível com `text-transparent` no children — mantém largura.

Anatomia base do `cva`: incluir `gap-1.5`, `font-medium`, `tracking-[-0.005em]`, `transition` com cubic-bezier do briefing, `focus-visible:shadow-[var(--shadow-focus)]`, `disabled:opacity-40 disabled:cursor-not-allowed`.

### 2.2 Adicionar tokens faltantes — `src/index.css`
Já existem `--brand-primary`, `--accent-h`, `--bg-surface-2`, `--border-subtle`. Adicionar:
- `--accent-soft: 28 100% 95%` (≈ `#FFE9D6`) e `--accent-soft-fg: 22 100% 36%` (≈ `#B85500`).
- `--accent-ring: hsl(var(--accent-h) / 0.24)`.
- `--danger-fg: 0 64% 36%` (≈ `#9A2122`).
- `--success-bg: 152 67% 90%`, `--success-fg: 158 80% 27%` (≈ `#0F7B5A`).
- `--warning-bg: 38 92% 92%`, `--warning-fg: 32 82% 31%` (≈ `#92590C`).
- `--info-bg: 217 90% 95%`, `--info-fg: 224 76% 48%` (≈ `#1D4ED8`).
- Keyframe `btn-spin` (Loader2 do lucide já anima — descartar).

### 2.3 Reescrever `Badge` — `src/components/ui/badge.tsx`
Adicionar variantes semânticas alinhadas ao briefing:
- `success`, `warning`, `accent`, `neutral`, `danger`, `info` — pílulas 22px, `font-size 11.5px`, `font-weight 500`, `border-radius 999px`, `cursor-default`, opcional `dot` (span 6×6 redondo) via `dotColor` prop.
- Manter `default | secondary | destructive | outline` como aliases mapeados (`destructive → danger`, etc.) para não quebrar callsites.
- Componente filho `BadgeDot` opcional para o ponto colorido.

### 2.4 Aplicar mapeamento em telas existentes
Apenas swap visual, sem mexer em lógica:

| Arquivo | Mudança |
|---|---|
| `src/components/chat/ChatHeader.tsx` | `Transferir` → `variant="secondary"`; `Assumir` → `variant="secondary"`; `Analisar` → `variant="ghost"` (toolbar) com `loading={isAnalyzing}`; `Configurações` (Link icon) → `variant="ghost" size="icon"`; lápis editar → `variant="ghost" size="icon-sm"`. |
| `src/components/chat/SentimentCard.tsx` | Se renderiza como botão "Negativo", trocar para `<Badge variant="danger">` com emoji+texto. (Verificar e ajustar render.) |
| `src/components/conversations/QueueIndicator.tsx` | Reescrever para usar `<Badge variant="warning">` (Na Fila com `Clock`) e `<Badge variant="neutral">` (Atribuído com `UserCheck`). Remover cores `bg-yellow-500/10` hardcoded. |
| `src/components/conversations/ConversationItem.tsx` | Substituir o `<Badge variant="secondary">` "Encerrada/Arquivada" pelo sistema novo (item 1.7). |
| `src/components/chat/topics/TopicBadges.tsx` | Trocar para `<Badge variant="info">` (Dúvida Produto, Vendas etc.). Garantir `cursor-default`. |
| `src/components/chat/ChatHeaderMenu.tsx` | Trocar trigger `Button variant="ghost" size="icon"`; Item "Reabrir" — remover qualquer fundo laranja; usar `<RotateCcw className="text-accent" />` + texto normal. Item "Encerrar" → adicionar classe `text-destructive`. |
| `src/components/chat/details/ConversationDetailsSidebar.tsx` | Botões internos (Reanalisar, Categorizar) → `variant="secondary" size="sm" loading={...}`. "Gerar Resumo" → `variant="accent" size="sm" loading={...}` (única CTA proativa do painel). |
| `src/pages/WhatsApp.tsx` | "Configurar Instância" no empty state → `variant="accent"`. |

### 2.5 Refino do `DropdownMenu` (não shadcn-wide, só dentro do `ChatHeaderMenu`)
- `DropdownMenuContent`: `className="min-w-[200px] p-1 bg-bg-surface border-subtle rounded-[10px] shadow-lg"` (sombra já tem `--shadow-lg`).
- `DropdownMenuItem`: padding `8px 12px`, height ~34px, `rounded-md`, `text-[13px]`, ícone `text-text-secondary`. Hover `bg-bg-surface-2`.
- Variante destrutiva: classe ad-hoc `text-[--danger-fg] hover:bg-[hsl(var(--danger-fg)/0.06)]` para "Encerrar" e "Arquivar".

### 2.6 Aceite Parte 2
- Nenhum `bg-yellow-500/10`, `bg-orange-500`, `text-white` hardcoded nos arquivos tocados.
- Botões de ação têm altura 36/30/40 (`md/sm/lg`) e `:focus-visible` com ring `--accent-ring`.
- Estados (Negativo, Atribuído, Na Fila, Encerrada, Reaberta, tópicos) renderizam como `<Badge>` `cursor-default` — nenhum é `<button>`.
- "Reabrir conversa" no menu não tem mais fundo laranja sólido; ícone na cor `--accent`, texto normal.
- Laranja aparece em ≤1 botão por viewport (sidebar de detalhes "Gerar Resumo" OU empty state "Configurar Instância").
- Loading preserva largura (texto fica `text-transparent`, spinner absoluto).

---

## Arquivos editados (resumo)

**Backend / lógica**
- `supabase/functions/evolution-webhook/index.ts` (transição automática + timeline)
- `src/hooks/whatsapp/useWhatsAppActions.ts` (close grava timeline; reopen aceita origin)
- `src/hooks/whatsapp/useWhatsAppSend.ts` (após envio, `reopened → active`)
- `src/hooks/whatsapp/useWhatsAppMessages.ts` (ao marcar como lida em `reopened`, `reopen_banner_dismissed = true`)

**UI — sistema**
- `src/components/ui/button.tsx` (variantes + sizes + loading)
- `src/components/ui/badge.tsx` (variantes semânticas + dot)
- `src/index.css` (tokens accent-soft/danger/success/warning/info)

**UI — aplicação dos tokens**
- `src/components/chat/ChatHeader.tsx`
- `src/components/chat/ChatHeaderMenu.tsx`
- `src/components/chat/SentimentCard.tsx`
- `src/components/chat/ChatArea.tsx` (faixa de reabertura)
- `src/components/chat/details/ConversationDetailsSidebar.tsx`
- `src/components/chat/topics/TopicBadges.tsx`
- `src/components/conversations/ConversationItem.tsx`
- `src/components/conversations/QueueIndicator.tsx`
- `src/components/conversations/ConversationFiltersPopover.tsx` (adicionar "Reabertas" ao select)
- `src/pages/WhatsApp.tsx` (CTA empty state)

**Não toca**
- Paleta, Geist, grid 400/1fr/300, tokens já estabelecidos.
- Outras telas (Relatório, Contatos, Settings) — somente se a mudança de variantes do Button/Badge afetar visual; nesse caso, manter mapping retrocompatível (`default → primary`, `outline → secondary`, `destructive → destructive`).
