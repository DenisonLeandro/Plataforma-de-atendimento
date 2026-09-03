# Cadastrar nova advogada na Denison Leandro Advocacia

Fluxo completo de cadastro de um novo membro na empresa **Denison Leandro Advocacia** (código `DLA001`, 6 WhatsApps conectados, 11 usuários hoje).

## Defaults que vou assumir (me corrija se quiser diferente)

- Perfil de acesso: **supervisor** — é o padrão do escritório hoje (8 dos 11 usuários são supervisor; só 2 são agent).
- Vínculo com a empresa: **Denison Leandro Advocacia**, conta já aprovada.
- Acesso às instâncias: **todas as 6** (Escritório Virtual, Centro, Cinco Conjuntos, Maringá, Ibiporã, São Lourenço), que é o comportamento atual de quem não tem restrição por instância.
- Senha: temporária definida por mim, para ela trocar no primeiro acesso pelo menu do perfil.

Preciso apenas de **nome completo + e-mail** dela para executar.

## Fluxo A — Admin cria a conta (recomendado, mais rápido)

1. Você me informa nome e e-mail.
2. Crio a conta de autenticação já com e-mail confirmado e senha temporária.
3. Vinculo o perfil à empresa Denison Leandro Advocacia e marco como aprovado e ativo.
4. Atribuo o papel escolhido (supervisor por padrão).
5. Libero o acesso às instâncias de WhatsApp desejadas.
6. Testo o login para garantir que funciona e te devolvo as credenciais no chat.
7. Ela entra e troca a senha em Perfil > Alterar senha.

## Fluxo B — Ela mesma se cadastra (auto-atendimento)

1. Ela acessa a plataforma e clica em "Criar conta".
2. Preenche nome, e-mail, senha e o **código da empresa: DLA001**.
3. Confirma o e-mail (se a confirmação estiver ativa) e vê a tela "Aguardando aprovação".
4. Um admin (você, Denison ou Renata) abre **Configurações > Equipe**, aprova o cadastro e ajusta o papel.
5. O admin libera as instâncias em **Configurações > Acesso às instâncias**.

## Depois do cadastro (comum aos dois fluxos)

- Conferir em Configurações > Equipe se ela aparece com papel e status corretos.
- Conferir se as conversas das instâncias liberadas aparecem para ela.
- Se ela deve responder com um nome diferente do cadastro (como foi feito com "Inês"), me avise para configurar o nome de exibição.

## Detalhes técnicos

- Empresa: `companies.id = 00000000-0000-0000-0000-000000000001`, `code = DLA001`.
- Criação: usuário em Auth via Admin API (`email_confirm: true`), `profiles` com `company_id`, `is_approved = true`, `is_active = true`; `user_roles` com `company_id` e o papel escolhido.
- Instâncias: linhas em `agent_instance_access` (`user_id`, `instance_id`, `company_id`) para cada WhatsApp liberado.
- Nenhuma alteração de código da aplicação é necessária; é operação de dados via ferramentas administrativas.
- Credenciais não vão para o repositório — apenas para o chat.
