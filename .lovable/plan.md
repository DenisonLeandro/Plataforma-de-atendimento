# Diagnóstico: por que as mensagens continuam falhando (sem alterações)

## O que encontrei (dados das últimas 6 horas)

| Escritório | Última msg de cliente (Brasília) | Atraso medido | Quedas de conexão em 6h |
|---|---|---|---|
| Advocacia Centro | 09:05 | ~6 horas | 22 |
| Cinco Conjuntos | 12:42 | ~2 horas | 14 |
| Ibiporã | 12:00 | ~1h45 | 18 |
| Acquadu | 13:06 | ~1h10 | 16 |
| Maringá | ontem 15:08 | — | 16 (0 msgs hoje) |
| São Lourenço | 11:09 | 0 | 20 |
| Desenvol 1 / 2 | 12:02 / 10:29 | 0 | 18 / 20 |
| Escritório Virtual | 11:55 | — | 12 |

## Conclusão

1. **Nosso app não está perdendo nada.** Todos os avisos que o servidor do WhatsApp mandou nas últimas 6 horas foram processados, sem nenhum erro ou fila presa.
2. **O problema está no servidor do WhatsApp (Evolution, na Hostinger).** Todos os números caem e voltam sozinhos a cada 15 a 30 minutos, o dia todo, mesmo quando estão "Conectados". Isso acontece em todos os escritórios ao mesmo tempo, então não é culpa do celular nem do QR Code.
3. **Por causa dessas quedas, as mensagens de clientes ficam presas no servidor** e chegam horas depois (Centro com 6h de atraso). Desconectar e conectar pelo app só ajuda por um tempo, porque o servidor volta a cair.
4. A versão da Evolution instalada (2.3.7) tem falhas conhecidas com o novo formato de contatos do WhatsApp, que causam exatamente essas quedas.

## O que sugiro (só depois da sua aprovação)

1. Quem cuida do servidor na Hostinger verificar os registros da Evolution e o uso de memória (quedas em todos os números juntos indicam reinício do servidor ou falta de memória).
2. Atualizar a Evolution para a versão mais nova estável, com backup antes.
3. Depois disso, ler um QR Code novo no Centro e no Cinco Conjuntos.
4. Nenhuma mudança no app é necessária para essa causa.
