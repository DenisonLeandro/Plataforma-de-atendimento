## Problema

Na tela `/whatsapp/contatos`, o cabeçalho do contato (`ContactHeader.tsx`) só permite editar as **Notas**. O nome (`isaias eng43` na imagem) aparece como texto estático, sem botão de edição — então não há como corrigir contatos que ficaram com nome errado, LID ou "Sem nome".

## Solução

Adicionar edição inline do **nome** no `ContactHeader`, no mesmo padrão visual do editor de Notas já existente (ícone lápis → input + Salvar/Cancelar). Vale para todas as empresas e instâncias, pois usa a mesma tabela `whatsapp_contacts` com as RLS multi-tenant já vigentes.

### Mudanças

**1. `src/components/contacts/ContactHeader.tsx`**
- Novo estado `isEditingName`, `name`, `isSavingName`.
- Ao lado do `<h2>` com o nome, renderizar um botão fantasma com ícone `Pencil` (só aparece no hover ou sempre — seguir padrão simples: sempre visível, discreto, como o botão "Editar" das notas).
- Em modo edição: substituir o `<h2>` por um `<Input>` controlado + botões Salvar / Cancelar (ícones `Save` / `X`), reutilizando o visual dos botões de notas.
- `handleSaveName`:
  - Validar: `name.trim().length > 0`, senão `toast.error("Nome não pode ficar vazio")`.
  - `supabase.from('whatsapp_contacts').update({ name: name.trim() }).eq('id', contact.id)`.
  - Em sucesso: `toast.success('Nome atualizado')`, sair do modo edição, invalidar queries `['contact-details', contact.id]`, `['whatsapp-contacts']` e `['whatsapp', 'conversations']` (o nome aparece nos cards de conversa também).
  - Em erro: `toast.error('Erro ao salvar nome')`.
- Enter salva, Esc cancela (opcional, alinhado com padrão do app).

### Fora de escopo
- Não alterar telefone, avatar ou outros campos.
- Não mexer em RLS: a policy atual de UPDATE em `whatsapp_contacts` já permite que membros da empresa editem seus contatos.
- Não tocar em nenhum outro componente/hook.

## Detalhes técnicos

- Arquivo único alterado: `src/components/contacts/ContactHeader.tsx`.
- Import adicional: `Input` de `@/components/ui/input`, ícone `Pencil` de `lucide-react`.
- Nenhuma migração de banco necessária.
- Nenhuma edge function envolvida.
