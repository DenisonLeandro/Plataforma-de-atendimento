## Diagnóstico

O botão **Atualizar** chama `refetch()` normalmente — a função existe e a RPC é disparada. O problema é de percepção: hoje o ícone só gira e o botão só desabilita quando `isLoading` é `true`, e `isLoading` do React Query só é `true` na **primeira** carga. Nos cliques seguintes o estado que muda é `isFetching`, então o clique acontece, a requisição vai, mas nada muda visualmente e o usuário conclui que o botão "não funciona".

(Confirmei lendo `src/components/super-admin/AiCostDashboard.tsx` e `src/hooks/useAiUsageDashboard.ts`; nenhum overlay bloqueia o clique — a toolbar flutuante no screenshot é do editor Lovable, não da app.)

## Correção

Escopo: apenas frontend, arquivo `src/components/super-admin/AiCostDashboard.tsx` e o hook `src/hooks/useAiUsageDashboard.ts`.

1. Expor `isFetching` do React Query em `useAiUsageDashboard` (além de `isLoading`).
2. Em `AiCostDashboard`:
   - Usar `isFetching` para girar o ícone `RefreshCw` e desabilitar o botão durante qualquer refetch (não só o primeiro load).
   - Manter `isLoading` só para o placeholder grande "Carregando custos de IA...".
   - Adicionar um `toast.success('Dados atualizados')` no `onSuccess` do `refetch()` para dar confirmação explícita ao clique.

Nada de mudança em RPC, RLS ou lógica de negócio.
