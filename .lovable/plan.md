## PATCH 1 — Reverter laranja em elementos da identidade

**`src/components/auth/UserMenu.tsx`** (avatar "DH"):
- `AvatarFallback` className: `bg-brand text-text-on-dark` → `bg-accent text-white`.

**`src/components/conversations/ConversationsSidebar.tsx`** (botão "+"):
- Botão Plus (linha ~244-250): `bg-brand hover:bg-bg-nav-elevated text-text-on-dark` → `bg-accent hover:bg-[hsl(var(--accent-hover-h))] text-white`.

**`src/components/conversations/QuickFilterPills.tsx`** (chip ativo "Todas"):
- Ativo: `bg-brand text-text-on-dark border-brand` → `bg-accent text-white border-accent`.
- Hover inativo: `hover:bg-bg-surface-2 hover:text-text-primary` → `hover:bg-[hsl(var(--accent-soft))] hover:text-[hsl(var(--accent-h))] hover:border-[hsl(var(--accent-h)/0.2)]`.
- Badge contador no chip ativo: manter `bg-white/15`.

Demais elementos (botões secondary, badges semânticos, CTAs accent já existentes) ficam intocados.

---

## PATCH 2 — Remover estado "reopened" / "Reaberta"

**`supabase/functions/evolution-webhook/index.ts`** (linhas ~848-870):
- Trocar transição `closed → reopened` por `closed → active`.
- Remover gravação de `reopened_at`, `reopened_by`, `reopen_banner_dismissed`. Manter (opcional) entrada de timeline `reabertura_automatica` apenas para log no backend, sem campos extras no metadata.
- Remover o branch `else if (currentStatus === 'reopened')` que limpa metadata (não existirá mais esse status).
- Notificação ao atendente atribuído: já é coberta pelo realtime/insert da mensagem; nenhuma lógica nova de notificação é adicionada (mantém comportamento atual de incremento de unread + realtime).

**`src/components/chat/ReopenBanner.tsx`**: deletar arquivo.

**`src/components/chat/ChatArea.tsx`**:
- Remover import e uso de `<ReopenBanner ... />`.

**`src/components/conversations/ConversationItem.tsx`**:
- Remover bloco `showReopenedBadge` e o `<Badge variant="accent">Reaberta</Badge>`.
- Manter badges Encerrada/Arquivada.

**`src/hooks/whatsapp/useWhatsAppMessages.ts`**:
- Remover lógica de `if (conv?.status === 'reopened')` e do `reopen_banner_dismissed`. Voltar para um simples `update({ unread_count: 0 })`.

**`src/hooks/whatsapp/useWhatsAppActions.ts`** (`reopenMutation`):
- Manter o mutation (botão manual continua existindo), mas remover `reopened_by`, `reopened_at` do metadata. Manter apenas o `timeline` event `reabertura_manual` e `status: 'active'`.

**`src/components/chat/ChatHeaderMenu.tsx`**:
- Item "Reabrir conversa" deve aparecer apenas quando `status === 'closed'` (remover `|| 'archived'`). Para `archived`, mostrar normal "Encerrar conversa" oculto também → na verdade conforme spec: mostrar Reabrir só em closed; em outros status (incluindo archived), mostrar "Encerrar conversa".

**`src/components/conversations/ConversationFiltersPopover.tsx`**:
- Remover `<SelectItem value="reopened">Reabertas</SelectItem>`.

Nenhuma migração de banco; registros existentes com `status='reopened'` ficam órfãos visualmente (cairão no filtro "Todas" sem badge especial). Aceitável conforme spec ("ignorá-los na UI").

---

## Critérios de aceite (verificação visual após build)
- Avatar usuário, botão +, chip "Todas" ativo: laranja.
- Nenhum badge/faixa "Reaberta" em lugar nenhum.
- Conversa encerrada que recebe nova msg do cliente reaparece como "aberta" sem indicador especial.
- Botão "Reabrir conversa" aparece apenas em status `closed`.
