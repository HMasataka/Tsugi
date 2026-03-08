import type { SessionStatus, CliType } from "../types";

interface StatusBarProps {
  status: SessionStatus | null;
  cliType: CliType | null;
  sessionCount: number;
}

function statusDotClass(status: SessionStatus): string {
  if (status === "terminated") return "status-dot terminated";
  if (status === "running") return "status-dot running";
  return "status-dot";
}

function statusLabel(status: SessionStatus): string {
  if (status === "running") return "Running";
  return "Connected";
}

function cliLabel(cliType: CliType): string {
  if (cliType === "codex") return "Codex";
  return "Claude Code";
}

export function StatusBar({ status, cliType, sessionCount }: StatusBarProps) {
  if (sessionCount === 0) {
    return (
      <div className="statusbar">
        <div className="statusbar-left">
          <div className="status-item">
            <span className="status-dot terminated" />
            <span>No active session</span>
          </div>
        </div>
        <div className="statusbar-right">
          <div className="status-item">
            <span>v0.4.0</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="statusbar">
      <div className="statusbar-left">
        <div className="status-item">
          <span className={statusDotClass(status!)} />
          <span>
            {statusLabel(status!)}
            {status !== "terminated" && cliType && <> &middot; {cliLabel(cliType)}</>}
          </span>
        </div>
        <div className="status-item">
          <span>{sessionCount} session{sessionCount !== 1 ? "s" : ""}</span>
        </div>
      </div>
      <div className="statusbar-right">
        <div className="status-item">
          <span>v0.4.0</span>
        </div>
      </div>
    </div>
  );
}
