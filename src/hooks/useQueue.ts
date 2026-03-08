import { useReducer, useCallback } from "react";
import type { QueueItem, QueueItemStatus, QueueState } from "../types";

type QueueAction =
  | { type: "ADD_ITEM"; prompt: string }
  | { type: "ADD_ITEMS"; prompts: string[] }
  | { type: "REMOVE_ITEM"; id: string }
  | { type: "EDIT_ITEM"; id: string; prompt: string }
  | { type: "REORDER"; fromIndex: number; toIndex: number }
  | { type: "SET_ITEM_STATUS"; id: string; status: QueueItemStatus }
  | { type: "TOGGLE_AUTO_RUN" }
  | { type: "CLEAR_COMPLETED" }
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "SKIP_ITEM"; id: string }
  | { type: "RETRY_ITEM"; id: string }
  | { type: "SET_TIMEOUT"; id: string; timeoutMs: number | null }
  | { type: "CONFIRM_ITEM"; id: string }
  | { type: "CLEAR_CONFIRMING" };

function createQueueItem(prompt: string): QueueItem {
  return {
    id: crypto.randomUUID(),
    prompt,
    status: "pending",
    timeoutMs: null,
  };
}

function reorderItems(
  items: QueueItem[],
  fromIndex: number,
  toIndex: number,
): QueueItem[] {
  const result = [...items];
  const [moved] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, moved);
  return result;
}

function queueReducer(state: QueueState, action: QueueAction): QueueState {
  switch (action.type) {
    case "ADD_ITEM":
      return {
        ...state,
        items: [...state.items, createQueueItem(action.prompt)],
      };
    case "ADD_ITEMS":
      return {
        ...state,
        items: [
          ...state.items,
          ...action.prompts.map((p) => createQueueItem(p)),
        ],
      };
    case "REMOVE_ITEM":
      return {
        ...state,
        items: state.items.filter((item) => item.id !== action.id),
      };
    case "EDIT_ITEM":
      return {
        ...state,
        items: state.items.map((item) =>
          item.id === action.id ? { ...item, prompt: action.prompt } : item,
        ),
      };
    case "REORDER":
      return {
        ...state,
        items: reorderItems(state.items, action.fromIndex, action.toIndex),
      };
    case "SET_ITEM_STATUS":
      return {
        ...state,
        items: state.items.map((item) =>
          item.id === action.id ? { ...item, status: action.status } : item,
        ),
      };
    case "TOGGLE_AUTO_RUN":
      return { ...state, autoRun: !state.autoRun, confirmingItemId: null };
    case "CLEAR_COMPLETED":
      return {
        ...state,
        items: state.items.filter((item) => item.status !== "completed"),
      };
    case "PAUSE":
      return { ...state, paused: true };
    case "RESUME":
      return { ...state, paused: false };
    case "SKIP_ITEM":
      return {
        ...state,
        items: state.items.map((item) =>
          item.id === action.id ? { ...item, status: "skipped" as const } : item,
        ),
      };
    case "RETRY_ITEM":
      return {
        ...state,
        items: state.items.map((item) =>
          item.id === action.id && (item.status === "failed" || item.status === "skipped")
            ? { ...item, status: "pending" as const }
            : item,
        ),
      };
    case "SET_TIMEOUT":
      return {
        ...state,
        items: state.items.map((item) =>
          item.id === action.id ? { ...item, timeoutMs: action.timeoutMs } : item,
        ),
      };
    case "CONFIRM_ITEM":
      return { ...state, confirmingItemId: action.id };
    case "CLEAR_CONFIRMING":
      return { ...state, confirmingItemId: null };
  }
}

const initialState: QueueState = {
  items: [],
  autoRun: false,
  paused: false,
  confirmingItemId: null,
};

export function useQueue() {
  const [state, dispatch] = useReducer(queueReducer, initialState);

  const addItem = useCallback((prompt: string) => {
    dispatch({ type: "ADD_ITEM", prompt });
  }, []);

  const addItems = useCallback((prompts: string[]) => {
    dispatch({ type: "ADD_ITEMS", prompts });
  }, []);

  const removeItem = useCallback((id: string) => {
    dispatch({ type: "REMOVE_ITEM", id });
  }, []);

  const editItem = useCallback((id: string, prompt: string) => {
    dispatch({ type: "EDIT_ITEM", id, prompt });
  }, []);

  const reorder = useCallback((fromIndex: number, toIndex: number) => {
    dispatch({ type: "REORDER", fromIndex, toIndex });
  }, []);

  const setItemStatus = useCallback(
    (id: string, status: QueueItemStatus) => {
      dispatch({ type: "SET_ITEM_STATUS", id, status });
    },
    [],
  );

  const toggleAutoRun = useCallback(() => {
    dispatch({ type: "TOGGLE_AUTO_RUN" });
  }, []);

  const clearCompleted = useCallback(() => {
    dispatch({ type: "CLEAR_COMPLETED" });
  }, []);

  const pause = useCallback(() => {
    dispatch({ type: "PAUSE" });
  }, []);

  const resume = useCallback(() => {
    dispatch({ type: "RESUME" });
  }, []);

  const skipItem = useCallback((id: string) => {
    dispatch({ type: "SKIP_ITEM", id });
  }, []);

  const retryItem = useCallback((id: string) => {
    dispatch({ type: "RETRY_ITEM", id });
  }, []);

  const setItemTimeout = useCallback((id: string, timeoutMs: number | null) => {
    dispatch({ type: "SET_TIMEOUT", id, timeoutMs });
  }, []);

  const confirmItem = useCallback((id: string) => {
    dispatch({ type: "CONFIRM_ITEM", id });
  }, []);

  const clearConfirming = useCallback(() => {
    dispatch({ type: "CLEAR_CONFIRMING" });
  }, []);

  return {
    state,
    addItem,
    addItems,
    removeItem,
    editItem,
    reorder,
    setItemStatus,
    toggleAutoRun,
    clearCompleted,
    pause,
    resume,
    skipItem,
    retryItem,
    setItemTimeout,
    confirmItem,
    clearConfirming,
  };
}

export { queueReducer, initialState };
export type { QueueAction };
