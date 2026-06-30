Plano para corrigir o corte/sobreposição do nome e número no cabeçalho da conversa:

1. **Reorganizar a área do contato no ChatHeader**
   - Separar visualmente avatar, botão de editar, nome e número para evitar que o botão de editar fique “em cima” do telefone.
   - Garantir que o nome do contato fique sempre acima do número, sem depender de ocultar barras laterais.
   - Se o nome estiver ausente de verdade no banco, manter “Sem nome”; se existir, exibir normalmente.

2. **Mover ações para uma faixa própria**
   - Manter Assumir, Transferir, Sentimento, Analisar, menu e configurações fora da área do nome/número.
   - Em telas com pouco espaço, essa faixa de ações poderá rolar horizontalmente sem empurrar ou cobrir os dados do contato.

3. **Ajustar largura responsiva das colunas**
   - Preservar a barra esquerda de conversas e a barra direita de detalhes abertas.
   - Reduzir larguras fixas excessivas onde necessário para notebook/PC menor, sem quebrar desktop, tablet e celular.
   - Manter a área central do chat com `min-w-0` e overflow controlado para não cortar seções.

4. **Validar visualmente nos tamanhos críticos**
   - Conferir no tamanho atual do usuário (~1008x577), notebook/PC intermediário, desktop maior e mobile.
   - Confirmar que avatar, nome, número, status atribuído e botões não ficam sobrepostos.