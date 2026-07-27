## Problema

A tela quebra com:
`cannot add 'postgres_changes' callbacks for realtime:platform-fixed-costs after subscribe()`

Isso é lançado em `src/hooks/usePlatformFixedCosts.ts` (linha ~34/52). O hook cria um canal Realtime com nome **fixo** `'platform-fixed-costs'`. Quando o efeito roda duas vezes (StrictMode em dev, ou o componente `PlatformFixedCostsEditor` monta enquanto o `PlatformCostDashboard` pai já montou outro consumidor), `supabase.channel('platform-fixed-costs')` devolve a **mesma instância já inscrita**, e chamar `.on(...)` depois do `.subscribe()` derruba a árvore React inteira → tela em branco / ErrorBoundary.

## Correção (mínima, só no hook)

Arquivo: `src/hooks/usePlatformFixedCosts.ts`

1. Gerar um nome de canal único por instância do hook:
   ```
   const channelName = `platform-fixed-costs:${crypto.randomUUID()}`;
   ```
   dentro do `useEffect`, para que StrictMode / múltiplos consumidores nunca colidam.
2. Manter o padrão correto: `channel().on(...).subscribe()` em uma única cadeia, e `supabase.removeChannel(channel)` no cleanup (já está).
3. Nenhuma outra mudança de lógica, RLS, query ou UI.

## Verificação

- Recarregar `/super-admin` → dashboard de custos da plataforma carrega sem ErrorBoundary.
- Console sem o erro `cannot add postgres_changes ... after subscribe()`.
- Editar/adicionar/remover um custo fixo continua atualizando em tempo real.
