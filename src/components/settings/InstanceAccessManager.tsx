import { useEffect, useState } from "react";
import { Check, Save, Smartphone } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useAgents } from "@/hooks/useAgents";
import { useWhatsAppInstances } from "@/hooks/whatsapp";
import { useInstanceAccess } from "@/hooks/useInstanceAccess";

interface AgentRowProps {
  agentId: string;
  agentName: string;
  agentRole: string;
  initialInstanceIds: string[];
  instances: { id: string; name: string }[];
  onSave: (instanceIds: string[]) => void;
  isSaving: boolean;
}

function AgentRow({
  agentId,
  agentName,
  agentRole,
  initialInstanceIds,
  instances,
  onSave,
  isSaving,
}: AgentRowProps) {
  const [selected, setSelected] = useState<string[]>(initialInstanceIds);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setSelected(initialInstanceIds);
  }, [initialInstanceIds.join(",")]);

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const dirty =
    selected.length !== initialInstanceIds.length ||
    selected.some((id) => !initialInstanceIds.includes(id));

  const selectedNames = instances.filter((i) => selected.includes(i.id));

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="font-medium">{agentName}</div>
          <Badge variant="outline" className="text-xs mt-1">
            {agentRole}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="min-w-[260px] justify-start">
                <Smartphone className="h-4 w-4 mr-2" />
                {selected.length === 0
                  ? "Sem restrição (vê todas)"
                  : `${selected.length} instância(s) permitida(s)`}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0" align="end">
              <Command>
                <CommandInput placeholder="Buscar instância..." />
                <CommandEmpty>Nenhuma instância encontrada.</CommandEmpty>
                <CommandGroup>
                  {instances.map((instance) => (
                    <CommandItem
                      key={instance.id}
                      value={instance.name}
                      onSelect={() => toggle(instance.id)}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          selected.includes(instance.id)
                            ? "opacity-100"
                            : "opacity-0"
                        )}
                      />
                      {instance.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </Command>
            </PopoverContent>
          </Popover>

          <Button
            size="sm"
            disabled={!dirty || isSaving}
            onClick={() => onSave(selected)}
          >
            <Save className="h-4 w-4 mr-1" />
            Salvar
          </Button>
        </div>
      </div>

      {selectedNames.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-2 border-t border-border">
          {selectedNames.map((i) => (
            <Badge key={i.id} variant="secondary" className="text-xs">
              {i.name}
            </Badge>
          ))}
        </div>
      )}
    </Card>
  );
}

export function InstanceAccessManager() {
  const { agents = [], isLoading: agentsLoading } = useAgents();
  const { instances = [], isLoading: instancesLoading } = useWhatsAppInstances();
  const { accessByUser, isLoading: accessLoading, setUserAccess } =
    useInstanceAccess();

  const isLoading = agentsLoading || instancesLoading || accessLoading;

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Acesso a Instâncias</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Defina quais instâncias cada membro pode visualizar. Quando nenhuma
          instância está selecionada, o usuário vê todas. Conversas já atribuídas
          ao usuário continuam visíveis mesmo se forem de outras instâncias.
        </p>
      </div>

      {agents.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Nenhum membro encontrado.
        </Card>
      ) : (
        <div className="space-y-3">
          {agents.map((agent) => (
            <AgentRow
              key={agent.id}
              agentId={agent.id}
              agentName={agent.full_name}
              agentRole={agent.role}
              initialInstanceIds={accessByUser[agent.id] || []}
              instances={instances.map((i) => ({ id: i.id, name: i.name }))}
              isSaving={setUserAccess.isPending}
              onSave={(instanceIds) =>
                setUserAccess.mutate({ userId: agent.id, instanceIds })
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}