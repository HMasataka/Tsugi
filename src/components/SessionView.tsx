import { useState, useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { SessionState, CliType } from "../types";
import { OutputStream } from "./OutputStream";
import { PromptInput } from "./PromptInput";

interface SessionViewProps {
  state: SessionState;
  onStartSession: (cwd: string, cliType: CliType) => Promise<void>;
  onSendPrompt: (prompt: string) => Promise<void>;
  onStopSession: () => Promise<void>;
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
  onStartSession,
  onSendPrompt,
  onStopSession,
}: SessionViewProps) {
  const [selectedCwd, setSelectedCwd] = useState<string | null>(null);
  const [selectedCli, setSelectedCli] = useState<CliType>("claude-code");

  const handleSelectDirectory = useCallback(async () => {
    const selected = await open({ directory: true });
    if (typeof selected === "string") {
      setSelectedCwd(selected);
    }
  }, []);

  const handleStart = useCallback(async () => {
    if (!selectedCwd) return;
    await onStartSession(selectedCwd, selectedCli);
  }, [selectedCwd, selectedCli, onStartSession]);

  if (state.status === "terminated") {
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
      <OutputStream outputs={state.outputs} />
      <PromptInput
        status={state.status}
        onSend={(prompt) => {
          void onSendPrompt(prompt);
        }}
      />
    </>
  );
}
