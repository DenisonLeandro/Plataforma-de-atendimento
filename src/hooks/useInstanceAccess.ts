import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface AgentInstanceAccessRow {
  id: string;
  user_id: string;
  instance_id: string;
}

export const useInstanceAccess = () => {
  const queryClient = useQueryClient();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["agent-instance-access"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_instance_access")
        .select("id, user_id, instance_id");
      if (error) throw error;
      return data as AgentInstanceAccessRow[];
    },
  });

  const accessByUser = rows.reduce<Record<string, string[]>>((acc, r) => {
    (acc[r.user_id] ||= []).push(r.instance_id);
    return acc;
  }, {});

  const setUserAccess = useMutation({
    mutationFn: async ({
      userId,
      instanceIds,
    }: {
      userId: string;
      instanceIds: string[];
    }) => {
      const { error: delErr } = await supabase
        .from("agent_instance_access")
        .delete()
        .eq("user_id", userId);
      if (delErr) throw delErr;

      if (instanceIds.length > 0) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const payload = instanceIds.map((instance_id) => ({
          user_id: userId,
          instance_id,
          created_by: user?.id ?? null,
        }));
        const { error: insErr } = await supabase
          .from("agent_instance_access")
          .insert(payload);
        if (insErr) throw insErr;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-instance-access"] });
      toast.success("Acesso a instâncias atualizado");
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao atualizar acesso");
    },
  });

  return { accessByUser, isLoading, setUserAccess };
};