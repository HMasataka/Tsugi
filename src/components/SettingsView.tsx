import { useState, useCallback } from "react";
import type { Settings, KeyboardShortcuts, CliType, ExecutionMode } from "../types";

type SettingsTab = "defaults" | "shortcuts";

interface SettingsViewProps {
  settings: Settings | null;
  onSave: (settings: Settings) => void;
}

export function SettingsView({ settings, onSave }: SettingsViewProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("defaults");
  const [draft, setDraft] = useState<Settings | null>(settings);
  const [recording, setRecording] = useState<keyof KeyboardShortcuts | null>(null);

  const handleChange = useCallback(
    <K extends keyof Settings>(key: K, value: Settings[K]) => {
      setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
    },
    [],
  );

  const handleShortcutChange = useCallback(
    (key: keyof KeyboardShortcuts, value: string) => {
      setDraft((prev) =>
        prev
          ? {
              ...prev,
              keyboardShortcuts: { ...prev.keyboardShortcuts, [key]: value },
            }
          : prev,
      );
    },
    [],
  );

  const handleSave = useCallback(() => {
    if (draft) {
      onSave(draft);
    }
  }, [draft, onSave]);

  const handleKeyCapture = useCallback(
    (field: keyof KeyboardShortcuts) => (event: React.KeyboardEvent) => {
      event.preventDefault();
      const parts: string[] = [];
      if (event.ctrlKey || event.metaKey) parts.push("Ctrl");
      if (event.shiftKey) parts.push("Shift");

      const key = event.key;
      if (!["Control", "Shift", "Meta", "Alt"].includes(key)) {
        parts.push(key.length === 1 ? key.toUpperCase() : key);
        handleShortcutChange(field, parts.join("+"));
        setRecording(null);
      }
    },
    [handleShortcutChange],
  );

  if (!draft) {
    return <div className="settings-view">Loading settings...</div>;
  }

  return (
    <div className="settings-view">
      <div className="content-header">
        <div className="content-header-left">
          <div className="content-title">Settings</div>
        </div>
      </div>

      <div className="tab-bar">
        <button
          className={`tab${activeTab === "defaults" ? " active" : ""}`}
          onClick={() => setActiveTab("defaults")}
        >
          Defaults
        </button>
        <button
          className={`tab${activeTab === "shortcuts" ? " active" : ""}`}
          onClick={() => setActiveTab("shortcuts")}
        >
          Keyboard Shortcuts
        </button>
      </div>

      <div className="content-body">
        {activeTab === "defaults" && (
          <div className="settings-form">
            <div className="settings-section">
              <div className="settings-section-header">CLI Tool</div>
              <div className="settings-item">
                <div className="settings-item-info">
                  <div className="settings-item-label">Default CLI Tool</div>
                </div>
                <div className="settings-item-control">
                  <select
                    value={draft.defaultCliType}
                    onChange={(e) => handleChange("defaultCliType", e.target.value as CliType)}
                  >
                    <option value="claude-code">Claude Code</option>
                    <option value="codex">Codex</option>
                  </select>
                </div>
              </div>

              <div className="settings-item">
                <div className="settings-item-info">
                  <div className="settings-item-label">Default CLI Arguments</div>
                  <div className="settings-item-hint">
                    Arguments applied to every new session by default
                  </div>
                </div>
                <div className="settings-item-control">
                  <input
                    type="text"
                    value={draft.defaultCliArgs}
                    placeholder="e.g., --dangerously-skip-permissions"
                    onChange={(e) => handleChange("defaultCliArgs", e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="settings-section">
              <div className="settings-section-header">Execution</div>
              <div className="settings-item">
                <div className="settings-item-info">
                  <div className="settings-item-label">Default Execution Mode</div>
                </div>
                <div className="settings-item-control">
                  <select
                    value={draft.defaultExecutionMode}
                    onChange={(e) => handleChange("defaultExecutionMode", e.target.value as ExecutionMode)}
                  >
                    <option value="auto">Auto</option>
                    <option value="manual">Manual</option>
                  </select>
                </div>
              </div>

              <div className="settings-item">
                <div className="settings-item-info">
                  <div className="settings-item-label">Default Timeout</div>
                </div>
                <div className="settings-item-control settings-item-control--with-unit">
                  <input
                    type="number"
                    value={draft.defaultTimeoutSecs}
                    min={0}
                    onChange={(e) => {
                      const parsed = Number(e.target.value);
                      if (!Number.isNaN(parsed)) {
                        handleChange("defaultTimeoutSecs", parsed);
                      }
                    }}
                  />
                  <span className="settings-unit">seconds</span>
                </div>
              </div>

              <div className="settings-item">
                <div className="settings-item-info">
                  <div className="settings-item-label">Auto-retry on failure</div>
                </div>
                <div className="settings-item-control">
                  <button
                    className={`toggle-track${draft.autoRetryOnFailure ? " on" : ""}`}
                    onClick={() =>
                      handleChange("autoRetryOnFailure", !draft.autoRetryOnFailure)
                    }
                  >
                    <div className="toggle-thumb" />
                  </button>
                </div>
              </div>
            </div>

            <div className="settings-section">
              <div className="settings-section-header">Notifications</div>
              <div className="settings-item">
                <div className="settings-item-info">
                  <div className="settings-item-label">Completion notification</div>
                </div>
                <div className="settings-item-control">
                  <button
                    className={`toggle-track${draft.notifyOnCompletion ? " on" : ""}`}
                    onClick={() =>
                      handleChange("notifyOnCompletion", !draft.notifyOnCompletion)
                    }
                  >
                    <div className="toggle-thumb" />
                  </button>
                </div>
              </div>

              <div className="settings-item">
                <div className="settings-item-info">
                  <div className="settings-item-label">Error notification</div>
                </div>
                <div className="settings-item-control">
                  <button
                    className={`toggle-track${draft.notifyOnError ? " on" : ""}`}
                    onClick={() => handleChange("notifyOnError", !draft.notifyOnError)}
                  >
                    <div className="toggle-thumb" />
                  </button>
                </div>
              </div>

              <div className="settings-item">
                <div className="settings-item-info">
                  <div className="settings-item-label">
                    Approval/Question notification
                  </div>
                </div>
                <div className="settings-item-control">
                  <button
                    className={`toggle-track${draft.notifyOnApproval ? " on" : ""}`}
                    onClick={() =>
                      handleChange("notifyOnApproval", !draft.notifyOnApproval)
                    }
                  >
                    <div className="toggle-thumb" />
                  </button>
                </div>
              </div>
            </div>

            <div className="settings-section">
              <div className="settings-section-header">Git</div>
              <div className="settings-item">
                <div className="settings-item-info">
                  <div className="settings-item-label">Auto worktree for flows</div>
                  <div className="settings-item-hint">
                    Automatically create an isolated git worktree when executing flows
                  </div>
                </div>
                <div className="settings-item-control">
                  <button
                    className={`toggle-track${draft.autoWorktreeForFlows ? " on" : ""}`}
                    onClick={() =>
                      handleChange(
                        "autoWorktreeForFlows",
                        !draft.autoWorktreeForFlows,
                      )
                    }
                  >
                    <div className="toggle-thumb" />
                  </button>
                </div>
              </div>
            </div>

            <div className="settings-actions">
              <button className="btn btn-primary" onClick={handleSave}>
                Save
              </button>
            </div>
          </div>
        )}

        {activeTab === "shortcuts" && (
          <div className="settings-form">
            <div className="settings-section">
              <div className="settings-section-header">Keyboard Shortcuts</div>
              {(
                [
                  ["sendPrompt", "Send Prompt"],
                  ["abort", "Abort"],
                  ["newSession", "New Session"],
                  ["closeSession", "Close Session"],
                  ["toggleAutoRun", "Toggle Auto-run"],
                  ["pauseResume", "Pause / Resume"],
                ] as const
              ).map(([key, label]) => (
                <div className="settings-item" key={key}>
                  <div className="settings-item-info">
                    <div className="settings-item-label">{label}</div>
                  </div>
                  <div className="settings-item-control">
                    {recording === key ? (
                      <input
                        className="shortcut-input recording"
                        placeholder="Press keys..."
                        autoFocus
                        readOnly
                        onKeyDown={handleKeyCapture(key)}
                        onBlur={() => setRecording(null)}
                      />
                    ) : (
                      <button
                        className="shortcut-display"
                        onClick={() => setRecording(key)}
                      >
                        {draft.keyboardShortcuts[key]}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="settings-actions">
              <button className="btn btn-primary" onClick={handleSave}>
                Save
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
