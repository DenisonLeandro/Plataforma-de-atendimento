Diagnóstico:
- A conversa “Denison Leandro” não aparece no filtro “Em Aberto” do admin porque no banco ela está com `status = reopened`.
- Hoje o filtro “Em Aberto” envia apenas `status = active`, então conversas reabertas/em andamento ficam fora da lista.
- Ela não está encerrada: está atribuída a uma agente e com status `reopened`, que representa uma conversa reaberta/em andamento após já ter passado por encerramento.

Plano de correção, sem mexer em mais nada:
1. Ajustar somente a lógica de consulta de conversas para aceitar uma lista de status quando necessário.
   - Manter o comportamento atual para filtros normais.
   - Adicionar suporte a buscar `status in (...)` sem alterar tabelas, políticas ou backend.

2. Ajustar somente o filtro do admin em “Em Aberto”.
   - Quando o usuário for admin e o status selecionado for `active`, buscar conversas com status `active` e `reopened`.
   - Não incluir `closed`, `archived` ou conversas encerradas sem atribuição.
   - Para agentes e supervisores, manter exatamente como está hoje.

3. Não alterar mais nada.
   - Sem migrations.
   - Sem mudanças em RLS.
   - Sem alterações visuais além do necessário na lógica do filtro.
   - Sem mexer nos demais filtros.