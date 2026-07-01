## Objetivo

Manter a regra atual — o **admin supremo** (Denison) só visualiza dados das outras empresas, sem poder alterar nada — e abrir uma exceção: na empresa **Piscinas Ibiporã** (a "Dom Piscinas"), Denison passa a ter permissão total (enviar mensagens, editar, gerenciar instâncias etc.), como se fosse admin dessa empresa.

## Como será feito

### 1. Nova tabela de exceções (banco)

`public.super_admin_company_access`
- `super_admin_id` (dono da permissão)
- `company_id` (empresa liberada)
- chave primária composta

Só o próprio super admin lê/escreve nessa tabela (via RLS + `service_role` para migrações). Isso deixa a regra explícita e auditável — no futuro basta adicionar/remover uma linha para liberar ou revogar outra empresa.

**Seed inicial:** liberar Denison em Piscinas Ibiporã.

### 2. Função auxiliar

`public.super_admin_can_write_company(_uid, _company_id)` retorna `true` quando existe linha correspondente na tabela acima. `SECURITY DEFINER`, `STABLE`.

### 3. Ajuste das RLS (o núcleo da mudança)

Hoje o super admin já enxerga tudo (via `can_user_see_instance` e `can_view_conversation`). Isso continua igual — **nenhuma leitura muda**.

O que muda é a escrita:

| Política | Antes | Depois |
|---|---|---|
| `whatsapp_conversations` INSERT/UPDATE `WITH CHECK` | `is_super_admin OR company_id = minha_empresa` | `super_admin_can_write_company(company_id) OR company_id = minha_empresa` |
| `whatsapp_messages` INSERT/UPDATE (via `can_access_conversation`) | Super admin não passa | `can_access_conversation` também retorna `true` quando `super_admin_can_write_company(conversa.company_id)` |
| `whatsapp_contacts` UPDATE (via `can_access_conversation`) | Idem | Idem (herda do ajuste acima) |
| `whatsapp_contacts` "Supervisors can manage contacts" | Qualquer admin/supervisor global | Restrito à empresa do usuário **ou** super admin com permissão explícita na empresa do contato |
| `whatsapp_instances` "Only admins can manage instances" | `is_super_admin` global | `super_admin_can_write_company(company_id) OR (admin da minha empresa)` |

Resultado: para todas as outras empresas, Denison continua com acesso somente-leitura (comportamento atual preservado). Para Piscinas Ibiporã, ele age como admin pleno.

### 4. Frontend

Nenhuma mudança de código necessária. Denison já usa o seletor "Ver como empresa" (`viewingAsCompanyId` no `AuthContext`) — ao selecionar Piscinas Ibiporã, os componentes de envio/edição chamam as mesmas funções e as novas RLS aceitam a operação. Nas demais empresas continuam bloqueadas com a mensagem de permissão que já existe.

### 5. Validação

- Denison logado, "vendo como" Piscinas Ibiporã → consegue abrir conversa, enviar texto/mídia, editar contato, editar instância.
- Denison logado, "vendo como" qualquer outra empresa → tudo continua somente-leitura (botões de envio dão erro de RLS, como hoje).
- Admin da própria Piscinas Ibiporã (Lucas) → sem alteração de comportamento.

## Observações

- Se amanhã você quiser liberar outra empresa (ou revogar Piscinas), basta inserir/remover uma linha em `super_admin_company_access` — sem novo deploy.
- Se aparecer uma segunda pessoa com papel de super admin no futuro, ela **não** herda essas permissões automaticamente: precisa ter a linha correspondente na tabela.
