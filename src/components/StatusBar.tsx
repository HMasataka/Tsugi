import type { SessionStatus, CliType, TokenUsage } from "../types";

interface StatusBarProps {
  status: SessionStatus | null;
  cliType: CliType | null;
  sessionCount: number;
  tokenUsage: TokenUsage | null;
}

// Claude Sonnet 4 pricing (USD per 1M tokens)
const TOKENS_PER_MILLION = 1_000_000;
const COST_INPUT = 3;
const COST_OUTPUT = 15;
const COST_CACHE_CREATION = 3.75;
const COST_CACHE_READ = 0.3;

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

function formatTokenCount(n: number): string {
  return n.toLocaleString("en-US");
}

function estimateCost(usage: TokenUsage): string {
  const cost =
    (usage.inputTokens * COST_INPUT +
      usage.outputTokens * COST_OUTPUT +
      usage.cacheCreationInputTokens * COST_CACHE_CREATION +
      usage.cacheReadInputTokens * COST_CACHE_READ) /
    TOKENS_PER_MILLION;
  return `~$${cost.toFixed(3)}`;
}

function hasUsage(usage: TokenUsage): boolean {
  return (
    usage.inputTokens > 0 ||
    usage.outputTokens > 0 ||
    usage.cacheCreationInputTokens > 0 ||
    usage.cacheReadInputTokens > 0
  );
}

export function StatusBar({ status, cliType, sessionCount, tokenUsage }: StatusBarProps) {
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
            <span>v0.5.0</span>
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
        {tokenUsage && hasUsage(tokenUsage) && (
          <>
            <div className="status-item status-item--tokens">
              <span>
                {formatTokenCount(tokenUsage.inputTokens)} in / {formatTokenCount(tokenUsage.outputTokens)} out
              </span>
            </div>
            <div className="status-item status-item--cost">
              <span>{estimateCost(tokenUsage)}</span>
            </div>
          </>
        )}
      </div>
      <div className="statusbar-right">
        <div className="status-item">
          <span>v0.5.0</span>
        </div>
      </div>
    </div>
  );
}
