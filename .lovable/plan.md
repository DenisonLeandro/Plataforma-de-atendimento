Vou corrigir a sincronização para deixar de ficar presa importando só contatos e passar a buscar conversas/mensagens primeiro.

Plano:

1. **Destravar o job atual**
   - Ajustar a lógica para considerar jobs `running` antigos como travados quando não atualizam há alguns minutos.
   - Permitir que o botão inicie/retome a sincronização nesses casos, em vez de ficar indefinidamente em “Sincronizando…”.

2. **Priorizar conversas e mensagens antes dos contatos**
   - Alterar a função `sync-whatsapp-history` para chamar `findChats` e `findMessages` primeiro.
   - Criar/atualizar contatos apenas para as conversas encontradas, em vez de importar milhares de contatos antes de começar as mensagens.
   - Deixar a importação completa de contatos para depois, como etapa secundária.

3. **Trocar o processamento longo por chunks reais**
   - Em vez de tentar rodar 25 minutos em uma única execução de backend, cada chamada processará um bloco curto e salvará o cursor.
   - Ao terminar um bloco, a função chamará a si mesma em background para continuar do cursor salvo.
   - Isso evita timeout silencioso do backend, que é o que deixou o job parado em `1712 contatos / 0 conversas / 0 mensagens`.

4. **Melhorar o status na tela**
   - Mostrar quando a sincronização está retomando ou quando está travada e precisa ser reiniciada.
   - Evitar esconder o botão para sempre quando o job ficou parado.
   - Invalidar/atualizar a lista de conversas quando mensagens começarem a entrar.

5. **Validar com dados reais**
   - Reimplantar a função de sincronização.
   - Verificar o job da instância `Advocacia Cinco Conjuntos` no banco.
   - Confirmar se conversas e mensagens começam a aparecer, não só contatos.

Detalhe técnico:
- O job atual parou com `contacts_synced = 1712`, `chats_synced = 0`, `messages_synced = 0` e não atualiza desde poucos minutos após iniciar. Isso indica timeout/morte do background task antes de chegar na etapa de conversas.