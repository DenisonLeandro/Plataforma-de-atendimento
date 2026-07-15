## Diagnóstico

Rodei 5 sincronizações no Escritório Virtual (instância `escritorio-virtual`, criada 15/07 12:58). Todas retornam o mesmo resultado:

- **contatos sincronizados:** 98–99 (agenda do WhatsApp) ✅
- **chats sincronizados:** 1
- **mensagens sincronizadas:** 7 (todas de 13/07, 15:16–15:18)
- **erro:** nenhum

O sync chama o Evolution em `POST /chat/findChats/escritorio-virtual` — e o Evolution está devolvendo **apenas 1 chat**. Não é bug da plataforma nem da RLS: o endpoint da Evolution, para essa instância, só conhece uma conversa.

## Por que isso acontece

É a limitação conhecida do **Baileys (conexão via QR Code)** — já registrada na memória do projeto:

- Baileys **não faz backfill do histórico do WhatsApp**. Ele só enxerga conversas que passaram pela sessão desde que o QR foi pareado.
- Como essa instância foi reconectada há poucos minutos (várias vezes hoje) e as mensagens visíveis são de 13/07 (antes de qualquer conexão atual), essa é a única conversa que o Baileys guardou em cache.
- A agenda de contatos (98) vem por outro caminho (`chat/findContacts`), que o Baileys popula na hora do pareamento — por isso funciona.
- Outras instâncias (advocacia-denison etc.) têm mais conversas porque foram pareadas há mais tempo e receberam mensagens desde então.

## O que a plataforma **não** consegue fazer

Não existe API pública do WhatsApp/Baileys para "puxar todas as conversas antigas" retroativamente. A Meta bloqueia isso deliberadamente. Nenhum ajuste no `sync-whatsapp-history` vai gerar chats que a Evolution não tem.

## Caminhos possíveis (o que **você** decide fazer)

1. **Esperar as conversas chegarem organicamente** — cada nova mensagem enviada/recebida cria a conversa na plataforma automaticamente via webhook. Em 1–2 dias de uso normal, a base já enche.

2. **Enviar uma mensagem de "oi" para os contatos importantes** a partir do próprio celular (não pela plataforma) — assim o Baileys registra o chat e o próximo sync trará essas conversas.

3. **Trocar o modo de conexão da instância na Evolution** — se o servidor Evolution suportar **WhatsApp Business Cloud API** oficial (não Baileys), o histórico fica no lado da Meta e é acessível. Requer WABA aprovada; muda a natureza do produto.

4. **Deixar como está** — para uso corrente da plataforma (atender clientes daqui pra frente), 1 chat inicial é normal em instância recém-pareada; o volume cresce sozinho.

## Não há código para mudar

Nada quebrado. Se quiser, posso adicionar um **aviso na UI** explicando "Baileys não importa histórico anterior à conexão — novas conversas aparecerão automaticamente" quando o sync termina com poucos chats. Me diz se quer esse toque de UX que eu implemento.
