## Problema

O Painel de Empresas (`/super-admin`) não carrega nada porque a tabela `public.companies` **não tem GRANTs** para os roles `authenticated`/`service_role`. Sem GRANT, o PostgREST rejeita a consulta antes mesmo das policies RLS serem avaliadas — resultado: nenhuma empresa aparece, mesmo para o super admin.

Verificado agora:
- RLS/policies estão corretas (super admin vê tudo, usuário vê a própria empresa).
- `SELECT grantee, privilege_type FROM information_schema.role_table_grants WHERE table_name='companies'` retornou vazio.

## Correção (uma migration)

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
```

Sem mudanças em código front-end. Após aprovar, a listagem de empresas volta a funcionar tanto no `/super-admin` quanto no `useCompanyContext` (nome da empresa no header).