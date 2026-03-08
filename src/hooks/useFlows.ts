import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Flow, FlowStep } from "../types";

export function useFlows() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const result = await invoke<Flow[]>("list_flows");
      setFlows(result);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createFlow = useCallback(
    async (name: string, description: string, steps: FlowStep[]) => {
      const flow = await invoke<Flow>("create_flow", { name, description, steps });
      await refresh();
      return flow;
    },
    [refresh],
  );

  const updateFlow = useCallback(
    async (flowId: string, name: string, description: string, steps: FlowStep[]) => {
      const flow = await invoke<Flow>("update_flow", { flowId, name, description, steps });
      await refresh();
      return flow;
    },
    [refresh],
  );

  const deleteFlow = useCallback(
    async (flowId: string) => {
      await invoke("delete_flow", { flowId });
      await refresh();
    },
    [refresh],
  );

  const importFlow = useCallback(
    async (json: string) => {
      const flow = await invoke<Flow>("import_flow", { json });
      await refresh();
      return flow;
    },
    [refresh],
  );

  const exportFlow = useCallback(
    async (flowId: string) => {
      return invoke<string>("export_flow", { flowId });
    },
    [],
  );

  return {
    flows,
    loading,
    error,
    refresh,
    createFlow,
    updateFlow,
    deleteFlow,
    importFlow,
    exportFlow,
  };
}
