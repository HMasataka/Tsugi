import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  ExecutionSummary,
  ExecutionDetail,
  HistoryFilter,
} from "../types";

const PAGE_SIZE = 20;

interface UseHistoryReturn {
  executions: ExecutionSummary[];
  loading: boolean;
  filter: HistoryFilter;
  expandedId: string | null;
  detail: ExecutionDetail | null;
  setKeyword: (keyword: string) => void;
  setStatusFilter: (status: string | undefined) => void;
  loadMore: () => void;
  hasMore: boolean;
  toggleExpand: (id: string) => void;
  refresh: () => void;
  deleteExecution: (id: string) => Promise<void>;
  exportExecution: (id: string) => Promise<string>;
}

export function useHistory(): UseHistoryReturn {
  const [executions, setExecutions] = useState<ExecutionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ExecutionDetail | null>(null);
  const [filter, setFilter] = useState<HistoryFilter>({
    limit: PAGE_SIZE,
    offset: 0,
  });

  const fetchExecutions = useCallback(
    async (currentFilter: HistoryFilter, append: boolean) => {
      setLoading(true);
      try {
        const results: ExecutionSummary[] = await invoke("list_executions", {
          filter: currentFilter,
        });
        if (append) {
          setExecutions((prev) => [...prev, ...results]);
        } else {
          setExecutions(results);
        }
        setHasMore(results.length >= PAGE_SIZE);
      } catch (e) {
        console.error("Failed to load executions:", e);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const append = filter.offset > 0;
    void fetchExecutions(filter, append);
  }, [filter, fetchExecutions]);

  const setKeyword = useCallback((keyword: string) => {
    setFilter((prev) => ({
      ...prev,
      keyword: keyword || undefined,
      offset: 0,
    }));
    setExpandedId(null);
    setDetail(null);
  }, []);

  const setStatusFilter = useCallback((status: string | undefined) => {
    setFilter((prev) => ({
      ...prev,
      status,
      offset: 0,
    }));
    setExpandedId(null);
    setDetail(null);
  }, []);

  const loadMore = useCallback(() => {
    setFilter((prev) => ({ ...prev, offset: prev.offset + PAGE_SIZE }));
  }, []);

  const toggleExpand = useCallback(
    async (id: string) => {
      if (expandedId === id) {
        setExpandedId(null);
        setDetail(null);
        return;
      }
      setExpandedId(id);
      try {
        const result: ExecutionDetail = await invoke("get_execution_detail", {
          executionId: id,
        });
        setDetail(result);
      } catch (e) {
        console.error("Failed to load execution detail:", e);
      }
    },
    [expandedId],
  );

  const refresh = useCallback(() => {
    setFilter((prev) => ({ ...prev, offset: 0 }));
    setExpandedId(null);
    setDetail(null);
  }, []);

  const deleteExecution = useCallback(
    async (id: string) => {
      await invoke("delete_execution", { executionId: id });
      setExecutions((prev) => prev.filter((e) => e.id !== id));
      if (expandedId === id) {
        setExpandedId(null);
        setDetail(null);
      }
    },
    [expandedId],
  );

  const exportExecution = useCallback(async (id: string): Promise<string> => {
    const result: string = await invoke("export_execution", {
      executionId: id,
    });
    return result;
  }, []);

  return {
    executions,
    loading,
    filter,
    expandedId,
    detail,
    setKeyword,
    setStatusFilter,
    loadMore,
    hasMore,
    toggleExpand,
    refresh,
    deleteExecution,
    exportExecution,
  };
}
