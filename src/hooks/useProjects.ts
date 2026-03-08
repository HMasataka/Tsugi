import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Project, RecentDirectory, CliType } from "../types";

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [recentDirs, setRecentDirs] = useState<RecentDirectory[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [p, d] = await Promise.all([
        invoke<Project[]>("list_projects"),
        invoke<RecentDirectory[]>("list_recent_dirs"),
      ]);
      setProjects(p);
      setRecentDirs(d);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const registerProject = useCallback(
    async (name: string, path: string, cliType: CliType) => {
      await invoke("register_project", { name, path, cliType });
      await refresh();
    },
    [refresh],
  );

  const unregisterProject = useCallback(
    async (projectId: string) => {
      await invoke("unregister_project", { projectId });
      await refresh();
    },
    [refresh],
  );

  return {
    projects,
    recentDirs,
    loading,
    registerProject,
    unregisterProject,
    refresh,
  };
}
