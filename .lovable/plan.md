## Objetivo

Permitir que qualquer usuário autenticado:
1. **Altere sua própria senha** a qualquer momento
2. **Exclua sua própria conta** (com confirmação)

## Onde aparece na UI

Adicionar duas novas seções dentro do `ProfileModal` (`src/components/auth/ProfileModal.tsx`), que já é aberto pelo menu do usuário (`UserMenu.tsx` → "Perfil"):

- **Aba/Seção "Segurança"**: campos "Nova senha" + "Confirmar nova senha" + botão "Alterar senha".
- **Seção "Zona de perigo"** (no final): botão vermelho "Excluir minha conta" que abre um `AlertDialog` exigindo o usuário digitar `EXCLUIR` (ou a palavra equivalente) para confirmar.

## Como funciona

### Alterar senha
- Chamada direta no client: `supabase.auth.updateUser({ password: novaSenha })`.
- Validações: mínimo 8 caracteres, as duas senhas devem coincidir.
- Mostrar toast de sucesso/erro. Não desloga o usuário.

### Excluir conta
- Criar Edge Function `delete-user-account` (verify_jwt validado no código via `SUPABASE_JWKS`/`getUser`):
  - Lê o JWT do header `Authorization`, obtém o `user.id`.
  - Usa o `SUPABASE_SERVICE_ROLE_KEY` para chamar `supabase.auth.admin.deleteUser(user.id)`.
  - Dados em `profiles`, `user_roles` etc. são removidos automaticamente via `ON DELETE CASCADE` (foreign key para `auth.users`), o que já existe no schema.
- No client: ao confirmar, chamar a edge function via `supabase.functions.invoke('delete-user-account')`, depois `supabase.auth.signOut()` e redirecionar para `/auth`.

## Restrição importante: último admin

Para evitar deixar o sistema sem nenhum administrador, a edge function `delete-user-account`:
- Se o usuário tem role `admin`, verifica quantos admins existem.
- Se for o **único admin**, retorna erro `400` com mensagem: *"Você é o único administrador. Promova outro usuário a administrador antes de excluir sua conta."*

## Arquivos afetados

- `src/components/auth/ProfileModal.tsx` — adicionar seções de alteração de senha e exclusão de conta.
- `supabase/functions/delete-user-account/index.ts` — nova edge function (service role + verificação de último admin).
- `supabase/config.toml` — registrar a nova função.

Nenhuma migração de banco é necessária (CASCADE já existe).

## Fora de escopo

- Reautenticação com senha atual antes de alterar (Supabase não exige; podemos adicionar depois se desejar).
- Exportar dados antes de excluir.
- Período de graça / "desfazer exclusão".
