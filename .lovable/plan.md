## Objetivo
Elevar o visual do CRM ao padrão Linear/Front/Superhuman, **sem** mexer em lógica, rotas ou estrutura — apenas tokens, tipografia, estados e larguras das 3 colunas principais.

## 1. Tipografia — Geist + Geist Mono
- Adicionar `@fontsource-variable/geist` e `@fontsource-variable/geist-mono` (ou `<link>` Google) importados em `src/main.tsx`.
- Atualizar `tailwind.config.ts`: `fontFamily.sans = ['Geist', 'Plus Jakarta Sans', 'system-ui']`, `fontFamily.mono = ['Geist Mono', 'ui-monospace']`.
- `index.css`: `font-feature-settings: "cv11","ss01","ss03"`, letter-spacing global, classe utilitária `.tabular` com `font-variant-numeric: tabular-nums`.

## 2. Design tokens (rewrite de `src/index.css`)
Substituir o bloco `:root` (e `.dark` equivalente) pelos tokens completos descritos no brief:
- Superfícies: `--bg-app`, `--bg-surface`, `--bg-surface-2`, `--bg-nav`, `--bg-nav-deep`, `--bg-nav-elevated`.
- Texto: `--text-primary/secondary/tertiary/on-dark/on-dark-soft`.
- Accent + soft + ring.
- Bordas: hairline / subtle / strong.
- Sombras xs→lg + `--shadow-focus`.
- Raios xs/sm/md/lg/pill, easing + durações.
- Mapear shadcn vars (`--background`, `--foreground`, `--primary`, `--border`, `--ring`, sidebar.*) para os novos tokens — `primary` permanece em `--brand-primary` (grafite), `accent` em laranja (uso escasso).
- Adicionar globalmente: scrollbars customizadas, `::selection`, `:focus-visible` ring, `transition` base, `@media (prefers-reduced-motion)` desativando animações, keyframes `float` e `shimmer`.
- Estender `tailwind.config.ts` com tokens novos (`bg-app`, `bg-surface`, `bg-surface-2`, `bg-nav-deep`, `text-on-dark*`, `border-hairline/subtle/strong`, `shadow-xs/sm/md/lg`, `rounded-pill`).

## 3. Grid principal (única mudança estrutural)
Arquivo: `src/pages/WhatsApp.tsx`.
- Converter o flex container em CSS grid via classe utilitária custom (`.app-grid`) definida em `index.css`:
  - default `grid-template-columns: 400px 1fr 300px`
  - `@media (max-width:1440px)`: `360px 1fr 280px`
  - `@media (max-width:1200px)`: `340px 1fr 0` + esconder painel de detalhes (`display:none`)
- Ajustar wrappers existentes da sidebar (`w-[350px]` → remover, deixar grid controlar) sem tocar nos componentes internos.
- `ConversationDetailsSidebar.tsx`: trocar `w-[350px]` por `w-full h-full`. Não alterar lógica/markup interno além da classe wrapper.

## 4. Refinamento por área (apenas classes/tokens, mesmos elementos)
- **UserMenu (topo sidebar)**: fundo `bg-nav-deep`, texto `text-on-dark`, avatar `bg-brand-primary` (não laranja), bolinha online com ring 2px do `bg-nav-deep`, sublabel "ADMINISTRADOR" em caps + tracking.
- **Search**: 40px, `bg-surface-2`, focus borda + ring laranja.
- **Botão "+"**: `bg-brand-primary` (não laranja), hover `bg-nav-elevated`.
- **QuickFilterPills**: chip ativo `bg-brand-primary` + texto on-dark; inativos transparent + borda subtle; badge numérico `bg-accent`.
- **Botão "Filtros"** (ConversationFiltersPopover trigger): variant outline com bg-surface.
- **ConversationItem**: padding 14×16, hairline divider, hover `bg-surface-2`, ativo = `bg-surface-2` + `border-l-[3px] border-accent`. Tags ("Encerrada", "Na Fila", nome agente) com paleta semântica definida. Timestamp tabular. Badge não lidas accent.
- **ChatArea estado vazio**: ícone 64px stroke border-strong, título `text-lg` peso 600, animação `float` (respeita reduced-motion). Barra de ações flutuante com radius-pill + shadow-md.
- **ConversationDetailsSidebar**: header padding 20×24, divisória hairline; CTA "Configurar Instância" único laranja.
- **DisconnectedInstancesBanner / botões topo**: ícones em `text-secondary` hover `brand-primary`.

## 5. Microdetalhes globais (em `index.css`)
- Scrollbars 6px customizadas.
- `:focus-visible { outline: none; box-shadow: var(--shadow-focus); }`.
- Transições padrão em `button, a, [role="button"], input, textarea`.
- `::selection`.
- Skeleton shimmer keyframe (aplicável ao componente Skeleton).
- Avatar default ring 2px bg-surface (classe utilitária).

## 6. Governança do laranja
Auditar componentes tocados garantindo accent só em: badge sino, badge contagem em chip, CTA principal ativo, barra lateral 3px da conversa selecionada e badge de não-lidas. Remover qualquer outro uso herdado (botão +, avatar default, chips ativos).

## Arquivos a alterar
- `src/main.tsx` — imports de fonte.
- `src/index.css` — tokens completos + grid utility + globals.
- `tailwind.config.ts` — fontFamily, cores semânticas extras, shadows, radius.
- `src/pages/WhatsApp.tsx` — wrapper vira `.app-grid`, remover larguras inline da sidebar/details.
- `src/components/conversations/ConversationsSidebar.tsx` — classes (UserMenu wrapper, search, botão +, chips, botão filtros, paginação footer).
- `src/components/conversations/QuickFilterPills.tsx` — classes do chip ativo/inativo + badge.
- `src/components/conversations/ConversationItem.tsx` — padding, hover, ativo, tags, timestamp tabular, badge.
- `src/components/conversations/ConversationFiltersPopover.tsx` — trigger button classes.
- `src/components/auth/UserMenu.tsx` — classes do cartão escuro.
- `src/components/chat/ChatArea.tsx` — estado vazio + barra de ações.
- `src/components/chat/details/ConversationDetailsSidebar.tsx` — wrapper width, paddings.
- `src/components/notifications/DisconnectedInstancesBanner.tsx` — paleta de alerta suave.
- `package.json` — `@fontsource-variable/geist`, `@fontsource-variable/geist-mono`.

## Fora do escopo
Nenhuma mudança em hooks, queries, edge functions, schema, rotas, ordem de elementos ou ícones diferentes.

## Changelog (entregar no fim da execução)
- Tokens/theme: `src/index.css`, `tailwind.config.ts`, `src/main.tsx`.
- Aplicação: componentes listados acima (apenas className/markup de wrapper).
- Grid: `src/pages/WhatsApp.tsx` via `.app-grid` definido em `src/index.css`.
