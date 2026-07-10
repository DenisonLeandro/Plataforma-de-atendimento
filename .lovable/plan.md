## Diagnóstico

O problema não parece ser banco cheio nem instância com 96 conversas abertas:

- O banco está saudável: 689 MB, disco em 53%, memória 47%, conexões 26/60.
- A instância **Piscinas Ibiporã** tem apenas **7 conversas abertas** e **960 encerradas**.
- O número **96** é o total global de conversas `active` em todas as instâncias/empresas, não o total filtrado da instância selecionada.
- A causa provável está no frontend: o filtro “Em Aberto” + paginação/contador pode estar usando um estado amplo/global em vez de sempre prender o contador à instância efetivamente selecionada.

## Plano de correção

1. **Corrigir a fonte do total mostrado no rodapé**
   - Ajustar a listagem para exibir o total retornado pela própria consulta filtrada quando houver filtro de status/instância.
   - Evitar que o contador global de abertas sobrescreva o total real da página.

2. **Unificar filtros aplicados na lista e no contador**
   - Garantir que `instanceId`, `status/statusIn`, busca, “minhas”, “fila”, “não lidas” e “aguardando” usem exatamente os mesmos parâmetros para total e lista.
   - Quando “Em Aberto” estiver selecionado, o total deve contar só conversas abertas visíveis dentro da instância/empresa selecionada.

3. **Corrigir o estado da paginação**
   - Ao mudar instância/status/filtro, resetar para página 1.
   - Se o total cair e a página atual ficar inválida, voltar automaticamente para a última página válida, impedindo página vazia com contador maior.

4. **Validar com dados reais**
   - Conferir que **Piscinas Ibiporã + Em Aberto** mostra cerca de **7 conversas**, sem permitir avançar para páginas vazias.
   - Conferir que o total global “Em Aberto” continua mostrando **96** somente quando nenhuma instância estiver filtrada e o usuário realmente tiver visibilidade de todas essas conversas.

## Arquivos prováveis

- `src/hooks/whatsapp/useWhatsAppConversations.ts`
- `src/components/conversations/ConversationsSidebar.tsx`

## Resultado esperado

A plataforma não deve mais mostrar “96 conversas” para Piscinas Ibiporã quando existem apenas 7 abertas, e o botão de próxima página ficará desativado quando não houver mais conversas reais para carregar.