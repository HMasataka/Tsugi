import type { SessionEntry } from "../types";

interface SessionTabBarProps {
  sessions: SessionEntry[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onCloseSession: (id: string) => void;
  onNewSession: () => void;
}

function statusDotClass(status: SessionEntry["state"]["status"]): string {
  if (status === "running") return "tab-status-dot running";
  if (status === "terminated") return "tab-status-dot terminated";
  return "tab-status-dot";
}

function dirName(cwd: string | null): string {
  if (!cwd) return "New Session";
  const parts = cwd.replace(/\/$/, "").split("/");
  return parts[parts.length - 1] || cwd;
}

export function SessionTabBar({
  sessions,
  activeSessionId,
  onSelectSession,
  onCloseSession,
  onNewSession,
}: SessionTabBarProps) {
  return (
    <div className="session-tab-bar">
      {sessions.map((session) => (
        <div
          key={session.id}
          className={`session-tab${session.id === activeSessionId ? " active" : ""}`}
          onClick={() => onSelectSession(session.id)}
        >
          <span className={statusDotClass(session.state.status)} />
          <span className="session-tab-label">{dirName(session.state.cwd)}</span>
          <button
            className="session-tab-close"
            onClick={(e) => {
              e.stopPropagation();
              onCloseSession(session.id);
            }}
          >
            &times;
          </button>
        </div>
      ))}
      <button className="session-tab-add" onClick={onNewSession}>
        +
      </button>
    </div>
  );
}
