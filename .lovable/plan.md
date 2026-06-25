## Diagnóstico

A Ana Clara vê todos os contatos como "Sem nome / Desconhecido" porque há uma inconsistência de RLS criada quando ampliamos a visibilidade de conversas:

- `whatsapp_conversations` e `whatsapp_messages` agora usam `can_view_conversation` (permite ao atendente enxergar todas as conversas das instâncias liberadas em **Acesso a Instâncias**, mesmo as atribuídas a outros).
- Porém a política de leitura de `whatsapp_contacts` (**"Agents can view contacts of accessible conversations"**) continua usando `can_access_conversation`, que é mais estrita (só libera quando a conversa está atribuída ao próprio agente ou não-atribuída e coberta por uma regra).

Resultado: a Ana enxerga a lista de conversas da `cinco-conjuntos`, mas o `SELECT` em `whatsapp_contacts` retorna `null` para quase tudo que não está atribuído a ela. O frontend cai no fallback `contact?.name || "Desconhecido"` / `"Sem nome"`.

**Os nomes não estão corrompidos no banco** — estão apenas invisíveis para ela por RLS. Não há necessidade de "recadastrar" nada.

## Correção

Alinhar a leitura de contatos à mesma regra de leitura de conversas:

1. `DROP POLICY "Agents can view contacts of accessible conversations" ON public.whatsapp_contacts;`
2. Recriar usando `can_view_conversation(auth.uid(), c.id)` no `EXISTS`, ou seja: qualquer atendente que possa **ver** a conversa também pode ler o contato dela.
3. Manter a política de **UPDATE** como está (continua exigindo `can_access_conversation`) — escrita segue restrita a quem é dono da conversa.
4. Não mexer em admin/supervisor (já cobertos pelas outras políticas).
5. Não precisa migração de dados; basta pedir para a Ana recarregar.

## Verificação

- Rodar `SELECT count(*) FROM public.whatsapp_contacts` simulando o JWT da Ana (via `set role` no painel) para confirmar que agora ela vê os contatos da `cinco-conjuntos`.
- Conferir na UI que `ConversationItem`, `ChatHeader` e `ContactItem` mostram o nome real em vez de "Sem nome / Desconhecido".
- Garantir que ela continua **sem** ver contatos de outras instâncias (deve haver 0 vazamentos).

## Escopo do que NÃO muda

- Nenhum código de frontend.
- Nenhuma alteração em `can_view_conversation` ou `can_access_conversation`.
- Nenhuma política de `whatsapp_messages`, `whatsapp_conversations` ou escrita em `whatsapp_contacts`.
