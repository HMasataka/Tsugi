import { useReducer, useCallback } from "react";
import { invoke, Channel } from "@tauri-apps/api/core";
import type {
  SessionState,
  SessionEvent,
  CliType,
  OutputEntry,
  OutputEventData,
  SessionStartedData,
  ProcessExitedData,
  ErrorData,
  QueueState,
  QueueItemStatus,
  QueueItem,
  SessionEntry,
  SessionManagerState,
  TokenUsage,
} from "../types";

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

const initialQueueState: QueueState = {
  items: [],
  autoRun: false,
  paused: false,
  confirmingItemId: null,
};

const zeroUsage: TokenUsage = {
  inputTokens: 0,
  cacheCreationInputTokens: 0,
  cacheReadInputTokens: 0,
  outputTokens: 0,
};

function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    cacheCreationInputTokens: a.cacheCreationInputTokens + b.cacheCreationInputTokens,
    cacheReadInputTokens: a.cacheReadInputTokens + b.cacheReadInputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
  };
}

const initialSessionState: SessionState = {
  cwd: null,
  cliType: "claude-code",
  status: "terminated",
  outputs: [],
  tokenUsage: { ...zeroUsage },
};

type SessionManagerAction =
  | { type: "ADD_SESSION"; id: string; cwd: string; cliType: CliType }
  | { type: "REMOVE_SESSION"; sessionId: string }
  | { type: "SET_ACTIVE"; sessionId: string }
  | { type: "SESSION_SET_RUNNING"; sessionId: string }
  | { type: "SESSION_ADD_OUTPUT"; sessionId: string; entry: OutputEntry }
  | { type: "SESSION_SET_IDLE"; sessionId: string }
  | { type: "SESSION_SET_TERMINATED"; sessionId: string }
  | { type: "QUEUE_ADD_ITEM"; sessionId: string; prompt: string }
  | { type: "QUEUE_ADD_ITEMS"; sessionId: string; prompts: string[] }
  | { type: "QUEUE_REMOVE_ITEM"; sessionId: string; itemId: string }
  | { type: "QUEUE_EDIT_ITEM"; sessionId: string; itemId: string; prompt: string }
  | { type: "QUEUE_REORDER"; sessionId: string; fromIndex: number; toIndex: number }
  | { type: "QUEUE_SET_ITEM_STATUS"; sessionId: string; itemId: string; status: QueueItemStatus }
  | { type: "QUEUE_TOGGLE_AUTO_RUN"; sessionId: string }
  | { type: "QUEUE_CLEAR_COMPLETED"; sessionId: string }
  | { type: "QUEUE_PAUSE"; sessionId: string }
  | { type: "QUEUE_RESUME"; sessionId: string }
  | { type: "QUEUE_SKIP_ITEM"; sessionId: string; itemId: string }
  | { type: "QUEUE_RETRY_ITEM"; sessionId: string; itemId: string }
  | { type: "QUEUE_SET_TIMEOUT"; sessionId: string; itemId: string; timeoutMs: number | null }
  | { type: "QUEUE_CONFIRM_ITEM"; sessionId: string; itemId: string }
  | { type: "QUEUE_CLEAR_CONFIRMING"; sessionId: string }
  | { type: "SESSION_ADD_USAGE"; sessionId: string; usage: TokenUsage };

function updateSession(
  sessions: SessionEntry[],
  sessionId: string,
  updater: (entry: SessionEntry) => SessionEntry,
): SessionEntry[] {
  return sessions.map((s) => (s.id === sessionId ? updater(s) : s));
}

function updateSessionQueue(
  sessions: SessionEntry[],
  sessionId: string,
  updater: (q: QueueState) => QueueState,
): SessionEntry[] {
  return updateSession(sessions, sessionId, (s) => ({
    ...s,
    queueState: updater(s.queueState),
  }));
}

function updateQueueItems(
  queue: QueueState,
  updater: (items: QueueItem[]) => QueueItem[],
): QueueState {
  return { ...queue, items: updater(queue.items) };
}

function sessionManagerReducer(
  state: SessionManagerState,
  action: SessionManagerAction,
): SessionManagerState {
  switch (action.type) {
    case "ADD_SESSION": {
      const newEntry: SessionEntry = {
        id: action.id,
        state: {
          ...initialSessionState,
          cwd: action.cwd,
          cliType: action.cliType,
          status: "idle",
        },
        queueState: { ...initialQueueState },
        startedAt: Date.now(),
      };
      return {
        sessions: [...state.sessions, newEntry],
        activeSessionId: action.id,
      };
    }
    case "REMOVE_SESSION": {
      const filtered = state.sessions.filter((s) => s.id !== action.sessionId);
      let nextActive = state.activeSessionId;
      if (state.activeSessionId === action.sessionId) {
        nextActive = filtered.length > 0 ? filtered[filtered.length - 1].id : null;
      }
      return { sessions: filtered, activeSessionId: nextActive };
    }
    case "SET_ACTIVE":
      return { ...state, activeSessionId: action.sessionId };

    case "SESSION_SET_RUNNING":
      return {
        ...state,
        sessions: updateSession(state.sessions, action.sessionId, (s) => ({
          ...s,
          state: { ...s.state, status: "running" },
        })),
      };
    case "SESSION_ADD_OUTPUT":
      return {
        ...state,
        sessions: updateSession(state.sessions, action.sessionId, (s) => ({
          ...s,
          state: { ...s.state, outputs: [...s.state.outputs, action.entry] },
        })),
      };
    case "SESSION_SET_IDLE":
      return {
        ...state,
        sessions: updateSession(state.sessions, action.sessionId, (s) => ({
          ...s,
          state: { ...s.state, status: "idle" },
        })),
      };
    case "SESSION_SET_TERMINATED":
      return {
        ...state,
        sessions: updateSession(state.sessions, action.sessionId, (s) => ({
          ...s,
          state: { ...s.state, status: "terminated" },
        })),
      };

    case "QUEUE_ADD_ITEM":
      return {
        ...state,
        sessions: updateSessionQueue(state.sessions, action.sessionId, (q) =>
          updateQueueItems(q, (items) => [...items, createQueueItem(action.prompt)]),
        ),
      };
    case "QUEUE_ADD_ITEMS":
      return {
        ...state,
        sessions: updateSessionQueue(state.sessions, action.sessionId, (q) =>
          updateQueueItems(q, (items) => [
            ...items,
            ...action.prompts.map((p) => createQueueItem(p)),
          ]),
        ),
      };
    case "QUEUE_REMOVE_ITEM":
      return {
        ...state,
        sessions: updateSessionQueue(state.sessions, action.sessionId, (q) =>
          updateQueueItems(q, (items) => items.filter((i) => i.id !== action.itemId)),
        ),
      };
    case "QUEUE_EDIT_ITEM":
      return {
        ...state,
        sessions: updateSessionQueue(state.sessions, action.sessionId, (q) =>
          updateQueueItems(q, (items) =>
            items.map((i) => (i.id === action.itemId ? { ...i, prompt: action.prompt } : i)),
          ),
        ),
      };
    case "QUEUE_REORDER":
      return {
        ...state,
        sessions: updateSessionQueue(state.sessions, action.sessionId, (q) =>
          updateQueueItems(q, (items) => reorderItems(items, action.fromIndex, action.toIndex)),
        ),
      };
    case "QUEUE_SET_ITEM_STATUS":
      return {
        ...state,
        sessions: updateSessionQueue(state.sessions, action.sessionId, (q) =>
          updateQueueItems(q, (items) =>
            items.map((i) => (i.id === action.itemId ? { ...i, status: action.status } : i)),
          ),
        ),
      };
    case "QUEUE_TOGGLE_AUTO_RUN":
      return {
        ...state,
        sessions: updateSessionQueue(state.sessions, action.sessionId, (q) => ({
          ...q,
          autoRun: !q.autoRun,
          confirmingItemId: null,
        })),
      };
    case "QUEUE_CLEAR_COMPLETED":
      return {
        ...state,
        sessions: updateSessionQueue(state.sessions, action.sessionId, (q) =>
          updateQueueItems(q, (items) => items.filter((i) => i.status !== "completed")),
        ),
      };
    case "QUEUE_PAUSE":
      return {
        ...state,
        sessions: updateSessionQueue(state.sessions, action.sessionId, (q) => ({
          ...q,
          paused: true,
        })),
      };
    case "QUEUE_RESUME":
      return {
        ...state,
        sessions: updateSessionQueue(state.sessions, action.sessionId, (q) => ({
          ...q,
          paused: false,
        })),
      };
    case "QUEUE_SKIP_ITEM":
      return {
        ...state,
        sessions: updateSessionQueue(state.sessions, action.sessionId, (q) =>
          updateQueueItems(q, (items) =>
            items.map((i) =>
              i.id === action.itemId ? { ...i, status: "skipped" as const } : i,
            ),
          ),
        ),
      };
    case "QUEUE_RETRY_ITEM":
      return {
        ...state,
        sessions: updateSessionQueue(state.sessions, action.sessionId, (q) =>
          updateQueueItems(q, (items) =>
            items.map((i) =>
              i.id === action.itemId && (i.status === "failed" || i.status === "skipped")
                ? { ...i, status: "pending" as const }
                : i,
            ),
          ),
        ),
      };
    case "QUEUE_SET_TIMEOUT":
      return {
        ...state,
        sessions: updateSessionQueue(state.sessions, action.sessionId, (q) =>
          updateQueueItems(q, (items) =>
            items.map((i) =>
              i.id === action.itemId ? { ...i, timeoutMs: action.timeoutMs } : i,
            ),
          ),
        ),
      };
    case "QUEUE_CONFIRM_ITEM":
      return {
        ...state,
        sessions: updateSessionQueue(state.sessions, action.sessionId, (q) => ({
          ...q,
          confirmingItemId: action.itemId,
        })),
      };
    case "QUEUE_CLEAR_CONFIRMING":
      return {
        ...state,
        sessions: updateSessionQueue(state.sessions, action.sessionId, (q) => ({
          ...q,
          confirmingItemId: null,
        })),
      };

    case "SESSION_ADD_USAGE":
      return {
        ...state,
        sessions: updateSession(state.sessions, action.sessionId, (s) => ({
          ...s,
          state: {
            ...s.state,
            tokenUsage: addUsage(s.state.tokenUsage, action.usage),
          },
        })),
      };
  }
}

function parseOutputContent(raw: string): OutputEntry[] {
  const id = crypto.randomUUID();
  const timestamp = Date.now();

  try {
    const json = JSON.parse(raw) as Record<string, unknown>;
    const eventType = typeof json.type === "string" ? json.type : undefined;

    if (eventType === "assistant") {
      return extractAssistantEntries(json, id, timestamp);
    }

    if (eventType === "tool_result") {
      const content = typeof json.content === "string" ? json.content : JSON.stringify(json);
      return [{
        id,
        type: "tool_result",
        content,
        timestamp,
      }];
    }

    if (eventType === "system") {
      const subtype = typeof json.subtype === "string" ? json.subtype : "unknown";
      const message = typeof json.message === "string" ? json.message : undefined;
      return [{
        id,
        type: "system",
        content: message ?? `system:${subtype}`,
        timestamp,
      }];
    }

    return [{ id, type: "system", content: raw, timestamp }];
  } catch {
    return [{ id, type: "system", content: raw, timestamp }];
  }
}

function summarizeToolUse(name: string, input: Record<string, unknown>): string {
  const keyForTool: Record<string, string> = {
    Read: "file_path",
    Edit: "file_path",
    Write: "file_path",
    Bash: "command",
    Glob: "pattern",
    Grep: "pattern",
  };

  const key = keyForTool[name];
  if (!key || typeof input[key] !== "string") {
    return name;
  }

  return `${name}: ${input[key]}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractAssistantEntries(
  json: Record<string, unknown>,
  baseId: string,
  timestamp: number,
): OutputEntry[] {
  if (!isRecord(json.message)) {
    return [{ id: baseId, type: "text", content: JSON.stringify(json), timestamp }];
  }
  const message = json.message;

  if (!Array.isArray(message.content)) {
    return [{ id: baseId, type: "text", content: JSON.stringify(json), timestamp }];
  }
  const content = message.content as unknown[];

  const entries: OutputEntry[] = [];

  const textParts = content
    .filter((block): block is Record<string, unknown> => isRecord(block) && block.type === "text")
    .map((block) => (typeof block.text === "string" ? block.text : String(block.text)));
  if (textParts.length > 0) {
    entries.push({ id: baseId, type: "text", content: textParts.join("\n"), timestamp });
  }

  const toolBlocks = content.filter(
    (block): block is Record<string, unknown> => isRecord(block) && block.type === "tool_use",
  );
  for (const block of toolBlocks) {
    const toolName = typeof block.name === "string" ? block.name : "unknown";
    const toolInput = isRecord(block.input) ? block.input : {};
    entries.push({
      id: crypto.randomUUID(),
      type: "tool_use",
      content: summarizeToolUse(toolName, toolInput),
      timestamp,
      toolName,
      toolInput,
    });
  }

  if (entries.length === 0) {
    entries.push({ id: baseId, type: "text", content: "", timestamp });
  }

  return entries;
}

function toNumber(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

function extractUsage(raw: string): TokenUsage | null {
  try {
    const json = JSON.parse(raw) as Record<string, unknown>;
    if (json.type !== "assistant") return null;

    if (!isRecord(json.message)) return null;
    const message = json.message;

    if (!isRecord(message.usage)) return null;
    const usage = message.usage;

    return {
      inputTokens: toNumber(usage.input_tokens),
      cacheCreationInputTokens: toNumber(usage.cache_creation_input_tokens),
      cacheReadInputTokens: toNumber(usage.cache_read_input_tokens),
      outputTokens: toNumber(usage.output_tokens),
    };
  } catch {
    return null;
  }
}

const initialManagerState: SessionManagerState = {
  sessions: [],
  activeSessionId: null,
};

export function useSessionManager() {
  const [state, dispatch] = useReducer(sessionManagerReducer, initialManagerState);

  const activeSession = state.sessions.find((s) => s.id === state.activeSessionId) ?? null;

  const startSession = useCallback(
    async (cwd: string, cliType: CliType, resumeSessionId?: string) => {
      const id: string = await invoke("start_session", {
        cwd,
        cliType,
        resumeSessionId: resumeSessionId ?? null,
      });
      dispatch({ type: "ADD_SESSION", id, cwd, cliType });
      return id;
    },
    [],
  );

  const sendPrompt = useCallback(
    async (
      sessionId: string,
      prompt: string,
      onProcessExited?: (code: number | null) => void,
    ) => {
      dispatch({ type: "SESSION_SET_RUNNING", sessionId });

      const onEvent = new Channel<SessionEvent>();
      onEvent.onmessage = (event: SessionEvent) => {
        switch (event.event) {
          case "output": {
            const data = event.data as OutputEventData;
            const entries = parseOutputContent(data.raw);
            for (const entry of entries) {
              dispatch({ type: "SESSION_ADD_OUTPUT", sessionId, entry });
            }
            const usage = extractUsage(data.raw);
            if (usage) {
              dispatch({ type: "SESSION_ADD_USAGE", sessionId, usage });
            }
            break;
          }
          case "sessionStarted": {
            const data = event.data as SessionStartedData;
            dispatch({
              type: "SESSION_ADD_OUTPUT",
              sessionId,
              entry: {
                id: crypto.randomUUID(),
                type: "system",
                content: `Session started: ${data.sessionId}`,
                timestamp: Date.now(),
              },
            });
            break;
          }
          case "processExited": {
            const data = event.data as ProcessExitedData;
            dispatch({
              type: "SESSION_ADD_OUTPUT",
              sessionId,
              entry: {
                id: crypto.randomUUID(),
                type: "system",
                content: `Process exited with code: ${data.code ?? "unknown"}`,
                timestamp: Date.now(),
              },
            });
            dispatch({ type: "SESSION_SET_IDLE", sessionId });
            onProcessExited?.(data.code);
            break;
          }
          case "error": {
            const data = event.data as ErrorData;
            dispatch({
              type: "SESSION_ADD_OUTPUT",
              sessionId,
              entry: {
                id: crypto.randomUUID(),
                type: "error",
                content: data.message,
                timestamp: Date.now(),
              },
            });
            break;
          }
        }
      };

      try {
        await invoke("send_prompt", { sessionId, prompt, onEvent });
      } catch (e) {
        dispatch({
          type: "SESSION_ADD_OUTPUT",
          sessionId,
          entry: {
            id: crypto.randomUUID(),
            type: "error",
            content: e instanceof Error ? e.message : String(e),
            timestamp: Date.now(),
          },
        });
        dispatch({ type: "SESSION_SET_IDLE", sessionId });
        onProcessExited?.(null);
      }
    },
    [],
  );

  const stopSession = useCallback(async (sessionId: string) => {
    await invoke("stop_session", { sessionId });
    dispatch({ type: "SESSION_SET_TERMINATED", sessionId });
  }, []);

  const closeSession = useCallback(
    async (sessionId: string) => {
      const session = state.sessions.find((s) => s.id === sessionId);
      if (session && session.state.status !== "terminated") {
        await invoke("stop_session", { sessionId });
      }
      dispatch({ type: "REMOVE_SESSION", sessionId });
    },
    [state.sessions],
  );

  const setActiveSession = useCallback((sessionId: string) => {
    dispatch({ type: "SET_ACTIVE", sessionId });
  }, []);

  const abortPrompt = useCallback(async (sessionId: string) => {
    await invoke("abort_prompt", { sessionId });
  }, []);

  const stopAllSessions = useCallback(async () => {
    await invoke("stop_all_sessions");
    for (const session of state.sessions) {
      dispatch({ type: "SESSION_SET_TERMINATED", sessionId: session.id });
    }
  }, [state.sessions]);

  const addItem = useCallback((sessionId: string, prompt: string) => {
    dispatch({ type: "QUEUE_ADD_ITEM", sessionId, prompt });
  }, []);

  const addItems = useCallback((sessionId: string, prompts: string[]) => {
    dispatch({ type: "QUEUE_ADD_ITEMS", sessionId, prompts });
  }, []);

  const removeItem = useCallback((sessionId: string, itemId: string) => {
    dispatch({ type: "QUEUE_REMOVE_ITEM", sessionId, itemId });
  }, []);

  const editItem = useCallback((sessionId: string, itemId: string, prompt: string) => {
    dispatch({ type: "QUEUE_EDIT_ITEM", sessionId, itemId, prompt });
  }, []);

  const reorder = useCallback((sessionId: string, fromIndex: number, toIndex: number) => {
    dispatch({ type: "QUEUE_REORDER", sessionId, fromIndex, toIndex });
  }, []);

  const setItemStatus = useCallback(
    (sessionId: string, itemId: string, status: QueueItemStatus) => {
      dispatch({ type: "QUEUE_SET_ITEM_STATUS", sessionId, itemId, status });
    },
    [],
  );

  const toggleAutoRun = useCallback((sessionId: string) => {
    dispatch({ type: "QUEUE_TOGGLE_AUTO_RUN", sessionId });
  }, []);

  const clearCompleted = useCallback((sessionId: string) => {
    dispatch({ type: "QUEUE_CLEAR_COMPLETED", sessionId });
  }, []);

  const pauseQueue = useCallback((sessionId: string) => {
    dispatch({ type: "QUEUE_PAUSE", sessionId });
  }, []);

  const resumeQueue = useCallback((sessionId: string) => {
    dispatch({ type: "QUEUE_RESUME", sessionId });
  }, []);

  const skipItem = useCallback((sessionId: string, itemId: string) => {
    dispatch({ type: "QUEUE_SKIP_ITEM", sessionId, itemId });
  }, []);

  const retryItem = useCallback((sessionId: string, itemId: string) => {
    dispatch({ type: "QUEUE_RETRY_ITEM", sessionId, itemId });
  }, []);

  const setItemTimeout = useCallback(
    (sessionId: string, itemId: string, timeoutMs: number | null) => {
      dispatch({ type: "QUEUE_SET_TIMEOUT", sessionId, itemId, timeoutMs });
    },
    [],
  );

  const confirmItem = useCallback((sessionId: string, itemId: string) => {
    dispatch({ type: "QUEUE_CONFIRM_ITEM", sessionId, itemId });
  }, []);

  const clearConfirming = useCallback((sessionId: string) => {
    dispatch({ type: "QUEUE_CLEAR_CONFIRMING", sessionId });
  }, []);

  return {
    state,
    activeSession,
    startSession,
    sendPrompt,
    stopSession,
    closeSession,
    setActiveSession,
    abortPrompt,
    stopAllSessions,
    addItem,
    addItems,
    removeItem,
    editItem,
    reorder,
    setItemStatus,
    toggleAutoRun,
    clearCompleted,
    pauseQueue,
    resumeQueue,
    skipItem,
    retryItem,
    setItemTimeout,
    confirmItem,
    clearConfirming,
  };
}

export {
  sessionManagerReducer,
  initialManagerState,
  parseOutputContent,
  extractUsage,
};
export type { SessionManagerAction };
