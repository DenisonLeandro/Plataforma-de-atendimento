# Baixar áudios recebidos

## O que muda
- Cada áudio nas conversas ganha um botão de **download** (ícone de seta) ao lado do player.
- Ao clicar, o arquivo é salvo no computador/celular com o nome `audio-<contato>-<data-hora>.<extensão>` (ex.: `.ogg`, `.mp3`).
- Vale para áudios recebidos e enviados. Se o áudio estiver indisponível, o botão não aparece.

## Detalhes técnicos
- `AudioMessagePlayer.tsx`: adicionar botão `Download` (lucide) que faz `fetch(mediaUrl)` (URL já assinada), cria um blob e dispara download via link temporário; extensão derivada do mimetype.
- Mensagem de erro (toast) se o download falhar.
- Sem mudanças no banco ou em permissões.
