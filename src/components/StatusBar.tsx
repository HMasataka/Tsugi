import type { SessionStatus, CliType } from "../types";

interface StatusBarProps {
  status: SessionStatus;
  cliType: CliType;
}

function statusDotClass(status: SessionStatus): string {
  if (status === "terminated") return "status-dot terminated";
  if (status === "running") return "status-dot running";
  return "status-dot";
}

function statusLabel(status: SessionStatus): string {
  if (status === "terminated") return "Terminated";
  if (status === "running") return "Running";
  return "Connected";
}

function cliLabel(cliType: CliType): string {
  if (cliType === "codex") return "Codex";
  return "Claude Code";
}

export function StatusBar({ status, cliType }: StatusBarProps) {
  return (
    <div className="statusbar">
      <div className="statusbar-left">
        <div className="status-item">
          <span className={statusDotClass(status)} />
          <span>
            {statusLabel(status)} &middot; {cliLabel(cliType)}
          </span>
        </div>
      </div>
      <div className="statusbar-right">
        <div className="status-item">
          <span>v0.1.0</span>
        </div>
      </div>
    </div>
  );
}
