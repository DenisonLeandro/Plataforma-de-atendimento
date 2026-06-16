## Diagnóstico

As contas em questão (Maria Ines, Juan, Leonardo, Ana Clara, Marcio, João, Renata, etc.) estão **todas com `profile` + `role` + `is_approved = true`** no banco — ou seja, o cadastro e a aprovação estão corretos. O log de auth também mostra login com `status: 200` para a Maria Ines. Portanto o problema **não é** de autenticação ou de conta "expirada"; é uma tela branca pós-login, provavelmente causada por um erro de renderização (uma query que falha e derruba a árvore React, ou um listener de realtime que lança).

Sem stack-trace específico no console que foi anexado, não dá pra apontar com 100% a query culpada. Por isso a correção tem duas frentes:

## Mudanças

### 1. Garantir que **nunca** apareça tela branca — `ErrorBoundary`

Criar `src/components/ErrorBoundary.tsx` (class component) e envolver toda a árvore dentro de `App.tsx`, entre `BrowserRouter` e `AuthProvider`. O fallback mostra:

- Mensagem amigável ("Algo deu errado ao carregar a plataforma")
- Botão **Recarregar página**
- Botão **Sair da conta** (chama `supabase.auth.signOut()` + limpa `localStorage` da sessão e redireciona para `/auth`)
- Bloco com o erro real (collapse), para o usuário copiar e mandar pra gente

Isso garante que mesmo se uma query/hook futuro lançar, o usuário vê uma tela útil em vez de fundo branco — e nós ganhamos o erro real no console.

### 2. Logar erros das queries da home para diagnóstico

Adicionar `console.error("[WhatsApp]", ...)` nos `useQuery` principais que rodam ao entrar em `/whatsapp`:
- `useWhatsAppConversations` (já tem `error` exposto, só não loga)
- `useWhatsAppInstances`
- `NotificationContext` (query `conversations-unread-count`)

Assim, na próxima vez que um atendente entrar, qualquer falha de RLS/permissão aparece nomeada no console — sem deixar a tela branca, graças ao ErrorBoundary.

### 3. Pequeno endurecimento no `AuthContext`

No `onAuthStateChange`, garantir `setIsLoading(false)` ao final do callback caso a sessão chegue via evento (e não via `getSession()` inicial). Hoje só o `getSession().then()` zera o loading — se por algum motivo o `getSession` inicial for mais lento que o `onAuthStateChange`, o `ProtectedRoute` pode ficar em loading indefinido. Pequena trava de cinto.

## Fora de escopo

- Não vou mexer em RLS nem nas contas existentes — todas estão consistentes no banco.
- Sem mudança de fluxo de aprovação / cadastro.
