export type CliType = "claude-code" | "codex";

export type SessionStatus = "idle" | "running" | "terminated";

export interface OutputEntry {
  id: string;
  type: "text" | "system" | "error";
  content: string;
  timestamp: number;
}

export interface SessionState {
  cwd: string | null;
  cliType: CliType;
  status: SessionStatus;
  outputs: OutputEntry[];
}

export interface SessionEvent {
  event: "output" | "sessionStarted" | "processExited" | "error";
  data: OutputEventData | SessionStartedData | ProcessExitedData | ErrorData;
}

export interface OutputEventData {
  raw: string;
}

export interface SessionStartedData {
  sessionId: string;
}

export interface ProcessExitedData {
  code: number | null;
}

export interface ErrorData {
  message: string;
}

export type QueueItemStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export interface QueueItem {
  id: string;
  prompt: string;
  status: QueueItemStatus;
  timeoutMs: number | null;
}

export interface QueueState {
  items: QueueItem[];
  autoRun: boolean;
  paused: boolean;
  confirmingItemId: string | null;
}
