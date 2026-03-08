import { Fragment, useState, useCallback } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { useHistory } from "../hooks/useHistory";
import type { CliType, ExecutionStepInfo } from "../types";

interface HistoryViewProps {
  onRerun: (cwd: string, cliType: CliType, prompts: string[]) => void;
}

type StatusTab = "all" | "completed" | "failed";

function formatDateTime(ms: number): string {
  const d = new Date(ms);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function formatDuration(startedAt: number, finishedAt: number | null): string {
  if (!finishedAt) return "--:--";
  const secs = Math.floor((finishedAt - startedAt) / 1000);
  const mins = Math.floor(secs / 60);
  const remainSecs = secs % 60;
  return `${mins}:${String(remainSecs).padStart(2, "0")}`;
}

function formatTokens(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return String(count);
}

function shortenPath(path: string): string {
  return path.replace(/^\/Users\/[^/]+/, "~");
}

export function HistoryView({ onRerun }: HistoryViewProps) {
  const {
    executions,
    loading,
    expandedId,
    detail,
    setKeyword,
    setStatusFilter,
    loadMore,
    hasMore,
    toggleExpand,
    refresh,
    deleteExecution,
    exportExecution,
  } = useHistory();

  const [activeTab, setActiveTab] = useState<StatusTab>("all");
  const [searchInput, setSearchInput] = useState("");

  const handleTabChange = useCallback(
    (tab: StatusTab) => {
      setActiveTab(tab);
      setStatusFilter(tab === "all" ? undefined : tab);
    },
    [setStatusFilter],
  );

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchInput(value);
      setKeyword(value);
    },
    [setKeyword],
  );

  const handleExport = useCallback(
    async (id: string) => {
      const json = await exportExecution(id);
      const path = await save({
        defaultPath: `execution-${id}.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (path) {
        await invoke("write_export_file", { path, content: json });
      }
    },
    [exportExecution],
  );

  const handleRerun = useCallback(
    (executionId: string) => {
      if (!detail || detail.execution.id !== executionId) return;
      const prompts = detail.steps.map((s) => s.prompt);
      onRerun(detail.execution.cwd, detail.execution.cliType, prompts);
    },
    [detail, onRerun],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteExecution(id);
    },
    [deleteExecution],
  );

  return (
    <div className="history-view">
      <div className="history-header">
        <div className="history-header-left">
          <h1 className="history-title">History</h1>
          <span className="history-subtitle">
            {executions.length} executions
          </span>
        </div>
        <div className="history-header-right">
          <button className="btn btn-ghost" onClick={refresh}>
            Refresh
          </button>
        </div>
      </div>

      <div className="history-toolbar">
        <div className="history-search">
          <input
            type="search"
            className="history-search-input"
            placeholder="Search..."
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </div>
        <div className="history-filter-tags">
          {(["all", "completed", "failed"] as const).map((tab) => (
            <button
              key={tab}
              className={`history-filter-tag${activeTab === tab ? " active" : ""}`}
              onClick={() => handleTabChange(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="history-body">
        {loading && executions.length === 0 ? (
          <div className="history-loading">Loading...</div>
        ) : executions.length === 0 ? (
          <div className="history-empty">No executions found</div>
        ) : (
          <div className="history-table-wrap">
            <table className="history-table">
              <thead>
                <tr>
                  <th>Date/Time</th>
                  <th>Directory</th>
                  <th>Status</th>
                  <th>Steps</th>
                  <th>Duration</th>
                  <th>Tokens</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {executions.map((exec) => (
                  <Fragment key={exec.id}>
                    <tr
                      className={`history-row${exec.status === "failed" ? " row-failed" : ""}`}
                      onClick={() => toggleExpand(exec.id)}
                    >
                      <td className="col-datetime">
                        {formatDateTime(exec.startedAt)}
                      </td>
                      <td>
                        <span className="dir-path">
                          {shortenPath(exec.cwd)}
                        </span>
                      </td>
                      <td>
                        <span className={`badge badge-${exec.status}`}>
                          {exec.status}
                        </span>
                      </td>
                      <td>{exec.stepCount}</td>
                      <td>
                        {formatDuration(exec.startedAt, exec.finishedAt)}
                      </td>
                      <td className="col-tokens">
                        {formatTokens(
                          exec.totalInputTokens + exec.totalOutputTokens,
                        )}
                      </td>
                      <td
                        className="col-actions"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => handleRerun(exec.id)}
                          disabled={
                            !detail || detail.execution.id !== exec.id
                          }
                        >
                          Re-run
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => void handleExport(exec.id)}
                        >
                          Export
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => void handleDelete(exec.id)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                    {expandedId === exec.id && detail && (
                      <tr key={`${exec.id}-detail`} className="expanded-row">
                        <td colSpan={7}>
                          <ExpandedDetail
                            steps={detail.steps}
                            onRerunFromStep={(stepOrder) => {
                              const prompts = detail.steps
                                .filter((s) => s.stepOrder >= stepOrder)
                                .map((s) => s.prompt);
                              onRerun(
                                detail.execution.cwd,
                                detail.execution.cliType,
                                prompts,
                              );
                            }}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
            {hasMore && (
              <div className="history-load-more">
                <button
                  className="btn btn-ghost"
                  onClick={loadMore}
                  disabled={loading}
                >
                  {loading ? "Loading..." : "Load more"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface ExpandedDetailProps {
  steps: ExecutionStepInfo[];
  onRerunFromStep: (stepOrder: number) => void;
}

function ExpandedDetail({ steps, onRerunFromStep }: ExpandedDetailProps) {
  return (
    <div className="expanded-detail">
      <div className="expanded-steps">
        {steps.map((step) => (
          <div
            key={step.id}
            className={`step-item step-${step.status}`}
          >
            <div className="step-indicator">
              <span className="step-number">{step.stepOrder + 1}</span>
              <span
                className={`step-status-icon ${step.status === "completed" ? "step-icon-success" : "step-icon-failed"}`}
              >
                {step.status === "completed" ? "\u2713" : "\u2717"}
              </span>
            </div>
            <div className="step-info">
              <div className="step-name">{step.prompt}</div>
              <div className="step-meta">
                <span className="step-meta-item">
                  tokens:{" "}
                  {formatTokens(step.inputTokens + step.outputTokens)}
                </span>
                <span className="step-meta-item">
                  {formatDuration(step.startedAt, step.finishedAt)}
                </span>
              </div>
            </div>
            <span className={`badge badge-${step.status}`}>
              {step.status}
            </span>
          </div>
        ))}
      </div>
      {steps.some((s) => s.status === "failed") && (
        <div className="expanded-actions">
          <button
            className="btn btn-primary btn-sm"
            onClick={() => {
              const failedStep = steps.find((s) => s.status === "failed");
              if (failedStep) {
                onRerunFromStep(failedStep.stepOrder);
              }
            }}
          >
            Re-run from failed step
          </button>
        </div>
      )}
    </div>
  );
}
