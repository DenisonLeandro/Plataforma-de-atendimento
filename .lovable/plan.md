## Problema

Após sincronizar uma instância nova (ex: "cinco conjuntos"), 1.088 contatos foram salvos corretamente no banco, mas o usuário não percebe porque:

1. O toast só diz "Contatos importados (N)" — não leva pra lugar nenhum.
2. A página /whatsapp (Conversas) fica vazia (esperado — WhatsApp/Baileys não envia histórico de chats pra instâncias recém-conectadas).
3. Os contatos só aparecem em /whatsapp/contatos, e o usuário precisa lembrar de trocar de aba e filtrar pela instância manualmente.

Nenhum bug de sync, RLS ou dados. É UX de descoberta.

## Mudanças (frontend apenas, sem tocar RLS/migrations/backend)

### 1. Toast com ação "Ver contatos" — `src/components/settings/InstanceCard.tsx`

No ramo `chats === 0 && contacts > 0` do `handleSync`, trocar o `toast.info` por um toast com botão `action` que navega para `/whatsapp/contatos?instance=<id>`.

Usar `useNavigate` do react-router e a prop `action` do sonner:

```ts
toast.info(
  `Contatos importados (${contacts}). Nenhuma conversa disponível ainda…`,
  {
    duration: 12000,
    action: {
      label: "Ver contatos",
      onClick: () => navigate(`/whatsapp/contatos?instance=${instance.id}`),
    },
  }
);
```

### 2. ContactsSidebar respeita `?instance=<id>` — `src/components/contacts/ContactsSidebar.tsx`

Ler `useSearchParams()` no mount e, se houver `instance`, usar como valor inicial de `selectedInstanceId` em vez de `'all'`. Mantém o comportamento padrão quando não há query param.

```ts
const [searchParams] = useSearchParams();
const initialInstance = searchParams.get('instance') ?? 'all';
const [selectedInstanceId, setSelectedInstanceId] = useState<string>(initialInstance);
```

## Fora do escopo (proposto separadamente, se você quiser)

- Aumentar `CONTACTS_PER_INVOCATION` de 75 → 200 no edge function `sync-whatsapp-history` (corta tempo de sync de ~2-3 min pra ~1 min). Mexe em backend — só faço se você confirmar.
- Banner/empty-state em /whatsapp explicando "instância recém-conectada não tem histórico de conversas" quando a instância filtrada tem contatos mas zero conversas.

## Restrições respeitadas

- Sem alteração de RLS, migrations, edge functions ou cor laranja.
- Mudança contida em 2 arquivos de UI.
