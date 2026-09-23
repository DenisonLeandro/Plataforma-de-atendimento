# Negrito nas mensagens

## Objetivo
Permitir aplicar negrito pelo botão **B** ou digitando `*texto*`, exatamente no formato aceito pelo WhatsApp.

## Implementação
1. Adicionar um botão **B** junto às ferramentas da caixa de mensagem.
   - Com texto selecionado, envolver a seleção com `*`.
   - Sem seleção, inserir os marcadores e posicionar o cursor entre eles.
   - Respeitar o modo somente leitura.
2. Enviar `*texto*` sem conversão, preservando o formato nativo de negrito do WhatsApp.
   - Preservar quebras de linha, emojis e partes sem formatação.
   - Não alterar a mensagem se os marcadores estiverem incompletos.
3. Exibir trechos entre `*texto*` em negrito nos balões do app, sem interpretar HTML e sem comprometer a segurança.
   - Aplicar também às legendas textuais de imagens e vídeos.
   - Manter os marcadores literais quando estiverem incompletos.
4. Validar seleção, cursor, envio com Enter, mensagens comuns, múltiplos trechos em negrito e visualização em telas menores.

## Escopo técnico
A mudança ficará na interface de composição e exibição das mensagens. Não exige alteração no banco de dados nem migration. O envio continuará usando o fluxo atual, apenas normalizando a marcação de negrito antes de chamar o WhatsApp.
