## Problema

No filtro "Personalizado" do Relatório WhatsApp, o calendário não permite selecionar 2 datas (intervalo). Identifiquei 2 causas em `src/components/reports/DateRangeFilter.tsx`:

1. **`onSelect` só aceita seleção completa** — o callback só chama `setCustomRange` quando `range.from` E `range.to` existem. No modo `range` do `react-day-picker`, o primeiro clique define apenas `from` (sem `to`). Como o estado local nunca é atualizado, o segundo clique é tratado como uma nova seleção inicial, criando um loop em que nunca se consegue fechar o intervalo.
2. **Falta `pointer-events-auto`** no Calendar dentro do Popover (padrão Shadcn), o que em alguns casos bloqueia cliques nos dias.

## Correção

Editar apenas `src/components/reports/DateRangeFilter.tsx`:

- Trocar o estado controlado do Calendar para usar `DateRange` parcial (permitir `from` sem `to`).
- Atualizar `setCustomRange` para aceitar/representar o intervalo parcial enquanto o usuário escolhe a 2ª data, e só ativar o período `'custom'` quando `from` e `to` estiverem definidos.
- Adicionar `className="pointer-events-auto"` no `<Calendar>`.
- Adicionar `initialFocus` e `defaultMonth` (mês da data `from` se houver) para melhor UX.

Tipos: ampliar `customRange` em `WhatsAppRelatorio.tsx` e na prop do componente para `{ from: Date; to?: Date } | null` (ou manter o tipo atual e armazenar o parcial em estado interno do componente — preferir essa opção para não tocar em `WhatsAppRelatorio.tsx`).

### Escopo
- 1 arquivo alterado: `src/components/reports/DateRangeFilter.tsx`.
- Sem mudanças em backend, hooks ou métricas.
