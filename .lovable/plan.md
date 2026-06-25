## Análise — por que tudo está em "aberta"

Olhei o banco em todas as instâncias. O cenário hoje:

| Instância | Ativas | Até 23/06 | De 24/06 em diante |
|---|---:|---:|---:|
| Advocacia Centro | 207 | **192** | 15 |
| Advocacia São Lourenço | 65 | **61** | 4 |
| Advocacia Cinco Conjuntos | 41 | **28** | 13 |
| Advocacia Maringá | 25 | **15** | 10 |
| Advocacia Ibiporã | 4 | 0 | 4 |
| **Total** | **342** | **296** | 46 |

### Causa raiz

Não é bug nem regressão. A plataforma **não tem nenhuma rotina de encerramento automático** de conversas:

- Uma conversa nasce como `active` quando entra a primeira mensagem (webhook do Evolution).
- Ela só sai de `active` quando alguém clica "Encerrar" ou "Arquivar" na UI, ou via ação manual.
- Não há job, trigger ou edge function que feche conversas por inatividade.

Resultado: como a operação raramente clica em "Encerrar" no fim de cada atendimento, o status `active` foi acumulando desde que a instância existe. Por isso "todas estão abertas" — é o efeito colateral de meses sem encerramento manual, agravado pelo fato de o Leonardo (admin) enxergar a fila inteira não-atribuída.

A limpeza que fizemos antes só atingiu a Ibiporã. As outras 4 instâncias nunca foram limpas — daí os 296 atendimentos antigos ainda em aberto.

## O que vou fazer

Uma única ação de dados, sem alterar código:

**Encerrar todas as conversas ativas, em todas as instâncias, cuja última mensagem é até 23/06/2026 (inclusive).**

```sql
UPDATE whatsapp_conversations
SET status = 'closed', updated_at = now()
WHERE status = 'active'
  AND last_message_at < '2026-06-24'::date;
```

Impacto esperado: **296 conversas encerradas** distribuídas assim:

- Advocacia Centro: 192
- Advocacia São Lourenço: 61
- Advocacia Cinco Conjuntos: 28
- Advocacia Maringá: 15
- Advocacia Ibiporã: 0 (já limpa)

As **46 conversas com mensagem em 24/06 ou depois ficam intocadas**. Conversas `archived` (12) e `closed` (1.805) também não são tocadas.

## Não incluído (posso fazer em planos separados se quiser)

- **Encerramento automático recorrente** (ex.: fechar tudo que ficar X dias sem nova mensagem) — exige decisão de produto sobre o prazo e se gera resumo IA. Hoje não existe.
- **Resumo IA por conversa encerrada no bulk** — pulado de propósito (seriam 296 chamadas).
- **Merge de contatos duplicados (@lid)** — limitação conhecida do Evolution, fora deste escopo.

Confirma que posso rodar o `UPDATE` em todas as instâncias?