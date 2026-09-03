# Corrigir cadastro da Nicolle na Denison Leandro Advocacia

A conta da Nicolle Oliveira foi criada hoje (03/09, 08:32) com três problemas confirmados no banco:

- E-mail com erro de digitação: `nicolleoiveiraadvogada@gmail.com` (falta o "l")
- Sem vínculo com nenhuma empresa (`company_id` vazio) — por isso ela não enxerga nada na plataforma
- Papel `agent` sem empresa e sem nenhuma instância de WhatsApp liberada

## O que vou fazer

1. Corrigir o e-mail de login para **nicolleoliveiraadvogada@gmail.com**, mantendo o e-mail já confirmado (ela não precisará confirmar de novo).
2. Corrigir também o e-mail exibido no perfil dela na plataforma.
3. Vincular a conta à empresa **Denison Leandro Advocacia** (perfil e papel), deixando aprovada e ativa.
4. Definir o papel como **supervisor** — é o padrão do escritório hoje (8 dos 11 usuários). Me avise se preferir `agent`.
5. Liberar o acesso às instâncias de WhatsApp. Padrão que vou aplicar: **todas as 6** (Escritório Virtual, Centro, Cinco Conjuntos, Maringá, Ibiporã, São Lourenço). Se ela deve ver só uma, é só dizer qual.
6. Testar o login com o e-mail corrigido e te confirmar aqui. Se a senha dela também estiver perdida, defino uma temporária e te passo no chat.

## Fluxo completo para os próximos cadastros

**Opção A — Admin cria a conta (mais rápido)**
1. Você me passa nome, e-mail e papel.
2. Crio a conta com e-mail confirmado e senha temporária.
3. Vinculo à empresa, aprovo e ativo.
4. Libero as instâncias de WhatsApp.
5. Testo o login e te entrego as credenciais no chat.

**Opção B — Ela mesma se cadastra**
1. Ela clica em "Criar conta" e informa nome, e-mail, senha e o **código da empresa: DLA001**.
2. Aparece a tela "Aguardando aprovação".
3. Um admin aprova em **Configurações > Equipe** e ajusta o papel.
4. O admin libera as instâncias em **Configurações > Acesso às instâncias**.

Ponto de atenção: quando o código da empresa não é informado no cadastro, a conta nasce sem empresa — foi exatamente o que aconteceu com a Nicolle.

## Detalhes técnicos

- Usuário: `b926adc0-bc61-4f7d-a56f-1325af1a7d55`; empresa `00000000-0000-0000-0000-000000000001` (código DLA001).
- Troca de e-mail via Admin API do Auth (`email` + `email_confirm: true`) e `UPDATE profiles.email`.
- Vínculo: `profiles.company_id`, `user_roles.company_id` + papel; acessos em `agent_instance_access` (`user_id`, `instance_id`, `company_id`).
- Sem alteração de código da aplicação; credenciais apenas no chat, nunca no repositório.
