## Objetivo
Adicionar botão "Excluir" em cada card de empresa no Painel Super Admin (`/super-admin`), com validações de proteção.

## Arquivo alterado
- `src/pages/SuperAdminPage.tsx` (único arquivo)

## Mudanças

### 1. Imports
- Adicionar `Trash2` no import do `lucide-react`.

### 2. Estados novos
```ts
const [deleteTarget, setDeleteTarget] = useState<CompanyEnriched | null>(null);
const [isDeleting, setIsDeleting] = useState(false);
```
Constante `PROTECTED_COMPANY_ID = '00000000-0000-0000-0000-000000000001'`.

### 3. Handler `handleDeleteCompany`
- Se `deleteTarget.id === PROTECTED_COMPANY_ID` → toast destructive: "Esta empresa não pode ser excluída."
- Se `deleteTarget.userCount > 0` → toast: "Remova todos os usuários desta empresa antes de excluí-la."
- Se `deleteTarget.instanceCount > 0` → toast: "Remova todas as instâncias desta empresa antes de excluí-la."
- Caso contrário: `DELETE FROM companies WHERE id = deleteTarget.id`.
- Sucesso: toast, `setDeleteTarget(null)`, atualiza cache via `queryClient.setQueryData(['super-admin','companies'], prev => prev.filter(c => c.id !== id))` (remoção sem recarregar) e chama `refetch()` no background.

### 4. Botão no card
Ao lado do botão Suspender/Ativar (mesma linha horizontal com `flex gap-2`), botão `variant="destructive"` `size="sm"` com ícone `Trash2` e label "Excluir". Desabilitado quando `company.id === PROTECTED_COMPANY_ID` (tooltip via `title="Empresa protegida"`).

Layout final do rodapé do card:
```
[Entrar como]  [Criar Admin]
[Suspender/Ativar]  [Excluir]
```

### 5. AlertDialog de confirmação
Novo `<AlertDialog open={!!deleteTarget} onOpenChange={...}>` com:
- Título: "Excluir empresa"
- Descrição: `Tem certeza? Esta ação não pode ser desfeita. A empresa ${deleteTarget?.name} será permanentemente removida.`
- Cancel + Action (destructive) chamando `handleDeleteCompany`, com loader durante `isDeleting`.

## Fora do escopo (respeitando restrições)
- Nenhuma migration, RLS ou edge function.
- Nenhuma outra página tocada.
- Cor laranja intocada; usa apenas tokens shadcn `destructive`.
- Validações redundantes ao RLS servem para UX/mensagens claras — o `DELETE` real depende da policy já existente em `companies`.

## Validação
- `npm run build` roda automaticamente pelo harness após a edição; confirmo tipos e retorno o diff.