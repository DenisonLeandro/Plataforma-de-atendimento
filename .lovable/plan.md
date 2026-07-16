## Objetivo

Manter Denison (super admin) com poder de escrita apenas nas empresas dele — **Denison Leandro Advocacia** e **Piscinas Ibipora**. Nas demais (hoje **Desenvol Informática**, e qualquer nova daqui pra frente) ele fica só como visualizador.

## Situação atual

Tabela `super_admin_company_access` para o Denison (`1ce4…9353`):

| company_id | empresa | manter? |
|---|---|---|
| `ab4c0aad…048b` | Piscinas Ibipora | sim |
| `d68c2a97…9007` | Desenvol Informática | **remover** |

- Advocacia é a empresa-mãe do Denison (via `profiles.company_id`), então ele escreve lá como admin normal — não precisa de linha na `super_admin_company_access`.
- Sem linha nessa tabela, o `super_admin_can_write_company` retorna false → UI entra em "Modo somente leitura" ao visualizar a empresa. Que é exatamente o comportamento desejado.

## Mudança

Executar um `DELETE` (via ferramenta de dados, não migração — é edição de dados, não de schema):

```sql
DELETE FROM public.super_admin_company_access
WHERE super_admin_id = '1ce45272-1241-4829-9435-6d841b959353'
  AND company_id     = 'd68c2a97-9ebb-44f8-afe0-357857ec9007';
```

## Regra para o futuro

Nenhuma alteração de código é necessária. O fluxo já é:

- Toda nova empresa nasce **sem** linha em `super_admin_company_access` para o Denison → ele vê tudo em modo leitura por padrão.
- Quando você me avisar que uma nova empresa passou a ser dele, eu insiro a linha correspondente e o modo escrita libera.

## Verificação pós-execução

1. Rodar `SELECT ... FROM super_admin_company_access` e conferir que sobrou só Piscinas Ibipora para o Denison.
2. Denison entra em Desenvol via "Entrar como…" → banner deve virar amarelo "Modo somente leitura", campos bloqueados.
3. Denison em Piscinas Ibipora → banner verde "Acesso total", edição liberada.
4. Denison em Advocacia (empresa própria) → sem banner de visualização, tudo normal.
