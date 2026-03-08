import { useState, useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { SessionState, CliType, QueueState } from "../types";
import { OutputStream } from "./OutputStream";
import { PromptInput } from "./PromptInput";
import { QueuePanel } from "./QueuePanel";

interface SessionViewProps {
  state: SessionState | null;
  queueState: QueueState | null;
  onStartSession: (cwd: string, cliType: CliType, resumeSessionId?: string) => Promise<void>;
  onSendPrompt: (prompt: string) => void;
  onStopSession: () => Promise<void>;
  onAddItem: (prompt: string) => void;
  onAddItems: (prompts: string[]) => void;
  onRemoveItem: (id: string) => void;
  onEditItem: (id: string, prompt: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onToggleAutoRun: () => void;
  onClearCompleted: () => void;
  onPause: () => void;
  onResume: () => void;
  onRetryItem: (id: string) => void;
  onAbort: () => void;
  onSetItemTimeout: (id: string, timeoutMs: number | null) => void;
  onConfirmExecute: (id: string) => void;
  onConfirmSkip: (id: string) => void;
}

function statusBadgeClass(status: SessionState["status"]): string {
  return `badge badge-${status}`;
}

function statusBadgeLabel(status: SessionState["status"]): string {
  if (status === "running") return "Running";
  if (status === "idle") return "Idle";
  return "Terminated";
}

export function SessionView({
  state,
  queueState,
  onStartSession,
  onSendPrompt,
  onStopSession,
  onAddItem,
  onAddItems,
  onRemoveItem,
  onEditItem,
  onReorder,
  onToggleAutoRun,
  onClearCompleted,
  onPause,
  onResume,
  onRetryItem,
  onAbort,
  onSetItemTimeout,
  onConfirmExecute,
  onConfirmSkip,
}: SessionViewProps) {
  const [selectedCwd, setSelectedCwd] = useState<string | null>(null);
  const [selectedCli, setSelectedCli] = useState<CliType>("claude-code");
  const [resumeId, setResumeId] = useState("");

  const handleSelectDirectory = useCallback(async () => {
    const selected = await open({ directory: true });
    if (typeof selected === "string") {
      setSelectedCwd(selected);
    }
  }, []);

  const handleStart = useCallback(async () => {
    if (!selectedCwd) return;
    await onStartSession(selectedCwd, selectedCli, resumeId || undefined);
  }, [selectedCwd, selectedCli, resumeId, onStartSession]);

  // Show setup form when no state or terminated
  if (!state || state.status === "terminated") {
    return (
      <div className="session-setup">
        <h2 className="session-setup-title">Start a Session</h2>
        <div className="session-setup-form">
          <div className="form-group">
            <label className="form-label">Working Directory</label>
            <div
              className={`form-value${selectedCwd ? "" : " form-value--placeholder"}`}
              onClick={handleSelectDirectory}
              style={{ cursor: "pointer" }}
            >
              {selectedCwd ?? "Click to select a directory..."}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">CLI Tool</label>
            <select
              className="form-select"
              value={selectedCli}
              onChange={(e) => setSelectedCli(e.target.value as CliType)}
            >
              <option value="claude-code">Claude Code</option>
              <option value="codex" disabled>
                Codex (coming soon)
              </option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Resume Session ID (optional)</label>
            <input
              className="form-value"
              type="text"
              placeholder="e.g., abc-123"
              value={resumeId}
              onChange={(e) => setResumeId(e.target.value)}
              style={{ cursor: "text" }}
            />
          </div>
          <button
            className="btn btn-primary"
            onClick={handleStart}
            disabled={!selectedCwd}
          >
            Start Session
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="session-header">
        <div className="session-header-left">
          <span className="session-path">{state.cwd}</span>
          <span className="tag">
            {state.cliType === "claude-code" ? "Claude Code" : "Codex"}
          </span>
        </div>
        <div className="session-header-right">
          <span className={statusBadgeClass(state.status)}>
            {statusBadgeLabel(state.status)}
          </span>
          <button className="btn btn-danger" onClick={onStopSession}>
            End Session
          </button>
        </div>
      </div>
      <div className="session-split">
        <div className="output-panel">
          <OutputStream outputs={state.outputs} />
          <PromptInput
            status={state.status}
            onSend={onSendPrompt}
          />
        </div>
        {queueState && (
          <QueuePanel
            state={queueState}
            onAddItem={onAddItem}
            onAddItems={onAddItems}
            onRemoveItem={onRemoveItem}
            onEditItem={onEditItem}
            onReorder={onReorder}
            onToggleAutoRun={onToggleAutoRun}
            onClearCompleted={onClearCompleted}
            onPause={onPause}
            onResume={onResume}
            onRetryItem={onRetryItem}
            onAbort={onAbort}
            onSetItemTimeout={onSetItemTimeout}
            onConfirmExecute={onConfirmExecute}
            onConfirmSkip={onConfirmSkip}
          />
        )}
      </div>
    </>
  );
}
