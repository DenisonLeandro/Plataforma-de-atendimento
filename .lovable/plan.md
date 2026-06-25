## Resposta

Sim — a correção já vale para **todos os agentes**, atuais e futuros. Não precisa rodar nada por usuário.

## Por quê

A política de RLS é avaliada por linha/usuário no momento da consulta. A nova regra de leitura em `whatsapp_contacts` é:

```
EXISTS (
  SELECT 1 FROM whatsapp_conversations c
  WHERE c.contact_id = whatsapp_contacts.id
    AND can_view_conversation(auth.uid(), c.id)
)
```

Ou seja, qualquer usuário autenticado que `can_view_conversation` aprovar vê o contato. E `can_view_conversation` já libera automaticamente qualquer atendente que tenha entrada em **`agent_instance_access`** para a instância da conversa.

Consequência prática:
- Admin/Supervisor: continuam vendo tudo (já cobertos por outra policy).
- Agente atual (ex.: Ana Clara): vê contatos de toda conversa da instância liberada a ele.
- **Agente novo**: assim que for criado e receber acesso em **Configurações → Acesso a Instâncias**, passa a enxergar contatos da mesma forma — sem precisar de migração, sem precisar tocar em código.
- Agente sem `agent_instance_access` para a instância: continua sem ver nada daquela instância (isolamento mantido).

## O que NÃO muda

- Edição de contatos continua restrita a quem é dono da conversa (`can_access_conversation`).
- Nenhuma alteração de frontend é necessária.
- Não há plano de migração/backfill — os nomes nunca foram perdidos.

## Plano

Nenhum código ou migração adicional. Apenas confirmação de que a correção anterior é universal.
