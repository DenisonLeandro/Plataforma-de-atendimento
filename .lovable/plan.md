## Problema

O banner e os botões usam apenas `isViewingAsCompany` para decidir se o modo é somente-leitura. Como Denison agora tem permissão de escrita em Piscinas Ibiporã (via `super_admin_company_access`), o backend aceita as ações, mas a interface continua bloqueando tudo e mostrando "MODO SOMENTE LEITURA".

## Solução

Introduzir um segundo sinal — `canWriteViewedCompany` — que consulta a nova tabela de exceções e é combinado com `isViewingAsCompany` para gerar um único flag de UI: `isReadOnlyView`.

### 1. Novo hook `useSuperAdminWriteAccess`

- Query no `super_admin_company_access` filtrando por `super_admin_id = user.id` e `company_id = viewingAsCompanyId`.
- Habilitada só quando `isSuperAdmin && isViewingAsCompany`.
- Retorna `{ canWrite: boolean, isLoading }`.
- Cache longo (staleTime 10 min).

### 2. `AuthContext`

Expor dois novos valores derivados:
- `canWriteViewedCompany: boolean` — vem do hook acima.
- `isReadOnlyView: boolean` = `isViewingAsCompany && !canWriteViewedCompany`.

`isViewingAsCompany` continua existindo para casos que precisem saber "estou vendo como outra empresa" independentemente da permissão (ex.: mostrar o banner).

### 3. Banner (`ViewAsBanner.tsx`)

- Continua aparecendo sempre que `isViewingAsCompany`.
- Quando `canWriteViewedCompany = true`: cor verde, texto "Acesso total como admin" e ícone de escudo/edit.
- Quando `false`: mantém o visual amarelo atual e o rótulo "Modo somente leitura".
- Botão "Sair do modo visualização" permanece.

### 4. Substituir bloqueios de UI

Trocar `isViewingAsCompany` por `isReadOnlyView` nas ações que envolvem escrita:
- `src/components/chat/ChatHeader.tsx` (assumir, transferir, análise, menu)
- `src/components/chat/ChatArea.tsx` (input desabilitado + aviso)

Componentes que só refletem contexto (labels, título) continuam usando `isViewingAsCompany`.

## Resultado esperado

- Denison entra "Ver como Piscinas Ibiporã" → banner verde "Acesso total", pode enviar mensagens, editar, transferir.
- Denison entra "Ver como Denison Advocacia" (ou outra empresa sem exceção) → banner amarelo, tudo somente-leitura (comportamento atual).
- Admin normal / agentes → nada muda.

## Sem alterações necessárias

- Banco de dados (já feito no passo anterior).
- Edge functions (RLS trata).
