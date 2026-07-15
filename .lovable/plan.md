## Criar 4 contas Supervisor — Desenvol Informática

Empresa: **Desenvol Informática** (`d68c2a97-9ebb-44f8-afe0-357857ec9007`)
Instâncias: Desenvol Suporte 1, Desenvol Suporte 2

### Contas a criar (senha `power@2015`, já aprovadas e ativas)
- vitor@desenvol.com.br
- leonardo@desenvol.com.br
- juliano@desenvol.com.br
- lucas@desenvol.com.br

### Passos
1. Para cada e-mail, criar usuário via Admin API (`auth.admin.createUser`) com `email_confirm: true` e senha `power@2015`.
2. Inserir/atualizar `profiles` com `company_id` da Desenvol, `is_active=true`, `is_approved=true`, `full_name` derivado do e-mail.
3. Inserir em `user_roles` a role `supervisor` vinculada à empresa Desenvol (sobrescrevendo qualquer role padrão criada pelo trigger).
4. Conceder acesso às duas instâncias em `agent_instance_access` (embora supervisor já enxergue por company, deixo explícito para consistência com os demais supervisores da empresa, se for o padrão — confirmo abaixo).

### Detalhes técnicos
- Uso a edge function `create-user` já existente (se houver) ou executo via SQL + Admin API através de uma função utilitária. Se não houver função apropriada, crio uma execução pontual usando `auth.admin` via edge function temporária ou uso o fluxo já usado para a Eduarda.
- Escopo estrito: nenhuma inserção em outras empresas, sem `super_admin_company_access`.

Confirma que quer supervisor (visibilidade total da empresa) e não agent com acesso restrito às 2 instâncias?
