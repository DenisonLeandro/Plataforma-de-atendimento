## Correção

Em `src/components/settings/InstanceCard.tsx`:

- Remover a condicional `instance.instance_id_external` — o botão passa a aparecer em toda instância.
- Trocar o `onClick` para abrir `https://evolution-api-hbbv.srv1746890.hstgr.cloud/manager` em nova aba.
- Simplificar a constante para `EVOLUTION_MANAGER_URL = "https://evolution-api-hbbv.srv1746890.hstgr.cloud/manager"`.
- Mantém ícone `ExternalLink`, tooltip "Abrir Evolution", mesmo tamanho dos demais botões do rodapé.

## Por que o botão sumiu

Todas as instâncias atuais têm `instance_id_external = NULL` (são self-hosted, identificadas por nome), então a condicional escondia o botão em todos os cards.
