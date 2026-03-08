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
  | { type: "CLEAR_COMPLETED" };

function createQueueItem(prompt: string): QueueItem {
  return {
    id: crypto.randomUUID(),
    prompt,
    status: "pending",
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
      return { ...state, autoRun: !state.autoRun };
    case "CLEAR_COMPLETED":
      return {
        ...state,
        items: state.items.filter((item) => item.status !== "completed"),
      };
  }
}

const initialState: QueueState = {
  items: [],
  autoRun: false,
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
  };
}

export { queueReducer, initialState };
export type { QueueAction };
