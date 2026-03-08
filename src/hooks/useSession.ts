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
} from "../types";

type Action =
  | { type: "START_SESSION"; cwd: string; cliType: CliType }
  | { type: "SET_RUNNING" }
  | { type: "ADD_OUTPUT"; entry: OutputEntry }
  | { type: "SET_IDLE" }
  | { type: "SET_TERMINATED" };

function sessionReducer(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case "START_SESSION":
      return {
        ...state,
        cwd: action.cwd,
        cliType: action.cliType,
        status: "idle",
        outputs: [],
      };
    case "SET_RUNNING":
      return { ...state, status: "running" };
    case "ADD_OUTPUT":
      return { ...state, outputs: [...state.outputs, action.entry] };
    case "SET_IDLE":
      return { ...state, status: "idle" };
    case "SET_TERMINATED":
      return {
        ...state,
        status: "terminated",
        cwd: null,
        outputs: [],
      };
  }
}

const initialState: SessionState = {
  cwd: null,
  cliType: "claude-code",
  status: "terminated",
  outputs: [],
};

function parseOutputContent(raw: string): OutputEntry {
  const id = crypto.randomUUID();
  const timestamp = Date.now();

  try {
    const json = JSON.parse(raw) as Record<string, unknown>;
    const eventType = json.type as string | undefined;

    if (eventType === "assistant") {
      const content = extractAssistantText(json);
      return { id, type: "text", content, timestamp };
    }

    if (eventType === "system") {
      const subtype = json.subtype as string | undefined;
      const message = json.message as string | undefined;
      return {
        id,
        type: "system",
        content: message ?? `system:${subtype ?? "unknown"}`,
        timestamp,
      };
    }

    return { id, type: "system", content: raw, timestamp };
  } catch {
    return { id, type: "system", content: raw, timestamp };
  }
}

function extractAssistantText(json: Record<string, unknown>): string {
  const message = json.message as Record<string, unknown> | undefined;
  if (!message) return JSON.stringify(json);

  const content = message.content as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(content)) return JSON.stringify(json);

  return content
    .filter((block) => block.type === "text")
    .map((block) => block.text as string)
    .join("\n");
}

export function useSession() {
  const [state, dispatch] = useReducer(sessionReducer, initialState);

  const startSession = useCallback(
    async (cwd: string, cliType: CliType) => {
      await invoke("start_session", { cwd, cliType });
      dispatch({ type: "START_SESSION", cwd, cliType });
    },
    [],
  );

  const sendPrompt = useCallback(
    async (prompt: string) => {
      dispatch({ type: "SET_RUNNING" });

      const onEvent = new Channel<SessionEvent>();
      onEvent.onmessage = (event: SessionEvent) => {
        switch (event.event) {
          case "output": {
            const data = event.data as OutputEventData;
            const entry = parseOutputContent(data.raw);
            dispatch({ type: "ADD_OUTPUT", entry });
            break;
          }
          case "sessionStarted": {
            const data = event.data as SessionStartedData;
            dispatch({
              type: "ADD_OUTPUT",
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
              type: "ADD_OUTPUT",
              entry: {
                id: crypto.randomUUID(),
                type: "system",
                content: `Process exited with code: ${data.code ?? "unknown"}`,
                timestamp: Date.now(),
              },
            });
            dispatch({ type: "SET_IDLE" });
            break;
          }
          case "error": {
            const data = event.data as ErrorData;
            dispatch({
              type: "ADD_OUTPUT",
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
        await invoke("send_prompt", { prompt, onEvent });
      } catch (e) {
        dispatch({
          type: "ADD_OUTPUT",
          entry: {
            id: crypto.randomUUID(),
            type: "error",
            content: e instanceof Error ? e.message : String(e),
            timestamp: Date.now(),
          },
        });
        dispatch({ type: "SET_IDLE" });
      }
    },
    [],
  );

  const stopSession = useCallback(async () => {
    await invoke("stop_session");
    dispatch({ type: "SET_TERMINATED" });
  }, []);

  return { state, startSession, sendPrompt, stopSession };
}
