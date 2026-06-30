## Diagnóstico

O problema principal não parece ser perda do texto no banco: na conversa do print, a mensagem `WANDERLEI DA CRUZ...` está salva completa com 275 caracteres, mas aparece cortada visualmente na tela. Também há mensagens muito maiores salvas, até 6.623 caracteres.

A causa mais provável é visual/layout: depois dos ajustes para manter as duas barras laterais abertas, a coluna central ficou estreita em algumas resoluções e o balão da mensagem enviada tem largura fixa proporcional (`max-w-[70%]`) dentro de uma área com `overflow-hidden`. Em mensagens maiores, principalmente enviadas pela plataforma, o conteúdo fica “preso”/cortado horizontalmente em vez de se adaptar ao espaço disponível.

Também encontrei um risco secundário no backend: o extrator de conteúdo do WhatsApp cobre textos normais e legendas de mídia, mas não trata todos os formatos especiais do WhatsApp/Evolution. Isso pode causar mensagem com conteúdo incompleto em casos específicos, embora o exemplo do print seja renderização, não banco.

## Plano de correção

1. **Corrigir o corte visual dos balões**
   - Ajustar o container do `MessageBubble` para usar `min-w-0`, largura máxima responsiva e largura mínima segura.
   - Trocar a largura fixa `max-w-[70%]` por regras responsivas que aproveitam melhor a coluna central quando as duas sidebars estão abertas.
   - Garantir que o texto tenha `overflow-wrap: anywhere` / quebra segura para palavras, números, processos, valores e textos longos sem espaços.

2. **Garantir que mensagens longas cresçam para baixo, não para fora**
   - Manter `whitespace-pre-wrap` para preservar quebras de linha.
   - Remover qualquer comportamento que possa cortar a altura/largura do balão.
   - Aplicar a mesma proteção para legendas de imagem, vídeo, documento e mídia pendente, não só para mensagem de texto comum.

3. **Blindar o layout com sidebars abertas**
   - Ajustar a área central do chat para não deixar o balão ultrapassar o espaço disponível.
   - Manter a barra de conversas à esquerda e detalhes à direita abertas, como solicitado.
   - Preservar os botões do cabeçalho do jeito atual, com ícone + texto e alinhados à direita.

4. **Melhorar extração de mensagens do WhatsApp**
   - Expandir o helper compartilhado que lê payloads da Evolution para capturar formatos adicionais de texto/legenda quando existirem.
   - Guardar metadados úteis para auditoria quando o conteúdo vier de um formato não padrão.
   - Evitar alterar histórico já correto; apenas impedir novos casos de mensagem incompleta.

5. **Criar uma verificação de prevenção**
   - Adicionar teste/checagem para mensagem longa com número de processo, valores em reais e texto sem quebras.
   - Validar que a mensagem completa aparece no DOM e quebra em múltiplas linhas sem scroll horizontal ou corte.

6. **Validação final**
   - Conferir a conversa do Leo Aguiar em largura parecida com seu PC/notebook.
   - Confirmar que a mensagem completa aparece no chat.
   - Conferir também uma mensagem curta, mídia com legenda e mensagem recebida para garantir que nada quebrou.