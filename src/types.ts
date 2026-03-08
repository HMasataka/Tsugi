export type CliType = "claude-code" | "codex";

export type SessionStatus = "idle" | "running" | "terminated";

export interface OutputEntry {
  id: string;
  type: "text" | "system" | "error" | "tool_use" | "tool_result";
  content: string;
  timestamp: number;
  toolName?: string;
  toolInput?: Record<string, unknown>;
}

export interface TokenUsage {
  inputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  outputTokens: number;
}

export interface SessionState {
  cwd: string | null;
  cliType: CliType;
  status: SessionStatus;
  outputs: OutputEntry[];
  tokenUsage: TokenUsage;
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

export interface QueueItemInput {
  prompt: string;
  timeoutMs: number | null;
}

export interface QueueState {
  items: QueueItem[];
  autoRun: boolean;
  paused: boolean;
  confirmingItemId: string | null;
}

// Multi-session types
export interface SessionEntry {
  id: string;
  state: SessionState;
  queueState: QueueState;
  startedAt: number;
}

export interface SessionManagerState {
  sessions: SessionEntry[];
  activeSessionId: string | null;
}

// Backend session info from list_sessions
export interface SessionInfo {
  id: string;
  pid: number | null;
  cwd: string;
  cliType: CliType;
  status: SessionStatus;
  elapsedSecs: number;
}

// Project types
export interface Project {
  id: string;
  name: string;
  path: string;
  cliType: CliType;
  lastOpenedAt: number;
}

export interface RecentDirectory {
  path: string;
  lastUsedAt: number;
}

export type PageId = "sessions" | "projects" | "history" | "flows";

// Flow types
export type FlowStepType = "prompt" | "condition" | "loop" | "validation" | "approval";

export interface FlowStep {
  name: string;
  stepType: FlowStepType;
  prompt: string;
  timeoutSecs: number | null;

  // condition
  conditionPrompt?: string;
  thenSteps?: FlowStep[];
  elseSteps?: FlowStep[];

  // loop
  loopConditionPrompt?: string;
  maxIterations?: number;

  // validation
  validationPattern?: string;
  maxRetries?: number;
  onFailSteps?: FlowStep[];
}

// Flow execution event types
export type FlowExecutionEventType =
  | "stepStarted"
  | "stepCompleted"
  | "stepFailed"
  | "conditionEvaluated"
  | "loopIteration"
  | "validationResult"
  | "approvalRequired"
  | "flowCompleted"
  | "flowFailed";

export interface FlowExecutionEvent {
  event: FlowExecutionEventType;
  data: Record<string, unknown>;
}

export interface Flow {
  id: string;
  name: string;
  description: string;
  steps: FlowStep[];
  createdAt: number;
  updatedAt: number;
}

export interface ExecutionSummary {
  id: string;
  cwd: string;
  cliType: CliType;
  status: "completed" | "failed" | "running";
  startedAt: number;
  finishedAt: number | null;
  stepCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

export interface ExecutionDetail {
  execution: ExecutionSummary;
  steps: ExecutionStepInfo[];
}

export interface ExecutionStepInfo {
  id: string;
  stepOrder: number;
  prompt: string;
  status: string;
  startedAt: number;
  finishedAt: number | null;
  exitCode: number | null;
  inputTokens: number;
  outputTokens: number;
}

export interface HistoryFilter {
  cwd?: string;
  status?: string;
  keyword?: string;
  dateFrom?: number;
  dateTo?: number;
  limit: number;
  offset: number;
}
