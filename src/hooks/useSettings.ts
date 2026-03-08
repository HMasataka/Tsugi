import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Settings } from "../types";

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const result = await invoke<Settings>("get_settings");
      setSettings(result);
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

  const updateSettings = useCallback(
    async (newSettings: Settings) => {
      const result = await invoke<Settings>("update_settings", {
        settings: newSettings,
      });
      setSettings(result);
      return result;
    },
    [],
  );

  return {
    settings,
    loading,
    error,
    refresh,
    updateSettings,
  };
}
