# Corrigir filtro de instâncias vazio para supervisores (Maria Ines)

## Diagnóstico

- Maria Ines (`ines@denisonleandro.adv.br`) é **supervisor** da empresa `0000...0001`, ativa e aprovada.
- A empresa possui 5 instâncias cadastradas.
- Ela **não tem nenhuma linha em `agent_instance_access`**.
- A política RLS de `whatsapp_instances` (`Users can view permitted instances`) filtra pela função `can_user_see_instance`, que hoje só permite:
  1. super admin, ou
  2. **admin** da mesma empresa, ou
  3. usuário com linha explícita em `agent_instance_access`.
- Supervisores não estão em nenhum dos ramos → nenhuma instância aparece no filtro (nem em nenhuma outra tela que dependa dessa função).

É exatamente a mesma classe de bug já identificada para o Leonardo. Corrigir a função resolve os dois casos e previne recorrência para qualquer supervisor futuro.

## Correção

Atualizar `public.can_user_see_instance` para tratar `supervisor` com a mesma regra do `admin` (visibilidade sobre todas as instâncias da própria empresa). Nenhuma mudança em RLS, GRANTs, frontend ou tipos.

```sql
CREATE OR REPLACE FUNCTION public.can_user_see_instance(_user_id uuid, _instance_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.is_super_admin(_user_id)
    OR (
      (public.has_role(_user_id, 'admin'::app_role)
       OR public.has_role(_user_id, 'supervisor'::app_role))
      AND EXISTS (
        SELECT 1 FROM public.whatsapp_instances i
        WHERE i.id = _instance_id
          AND i.company_id = public.get_user_company_id(_user_id)
      )
    )
    OR EXISTS (
      SELECT 1 FROM public.agent_instance_access a
      WHERE a.user_id = _user_id AND a.instance_id = _instance_id
    );
$$;
```

## Impacto

- Maria Ines (e Leonardo, e qualquer supervisor da empresa) passam a ver todas as instâncias da própria empresa no filtro, no gerenciador de acessos, nas conversas e nos relatórios.
- `can_access_conversation` já reconhecia `supervisor` para escrita — agora leitura/filtro ficam consistentes.
- Nenhum efeito sobre outras empresas: continua restrito por `company_id`. Agentes seguem restritos a `agent_instance_access`.

## Verificação após aplicar

1. `SELECT public.can_user_see_instance('d08bec96-…', id) FROM whatsapp_instances WHERE company_id='0000…0001'` → todos `true`.
2. Maria Ines recarrega `/whatsapp`: o filtro "Instância" lista as 5 instâncias.

## Prevenção

- Atualizar `mem://auth/role-permissions` registrando a regra: **supervisor tem paridade de leitura/visibilidade com admin dentro da própria empresa**, para que futuras alterações em `can_user_see_instance` / RLS preservem esse contrato.
