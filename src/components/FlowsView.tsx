import { useState, useCallback, useRef } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useFlows } from "../hooks/useFlows";
import type { Flow, FlowStep, CliType } from "../types";

interface FlowsViewProps {
  onEditFlow: (flowId: string) => void;
  onRunFlow: (flow: Flow, cwd: string, cliType: CliType) => void;
}

function formatTime(ms: number): string {
  const diff = Date.now() - ms;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function FlowCard({
  flow,
  onEdit,
  onExport,
  onRun,
  onDelete,
}: {
  flow: Flow;
  onEdit: () => void;
  onExport: () => void;
  onRun: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flow-card">
      <div className="flow-card-body">
        <div className="flow-name">{flow.name}</div>
        <div className="flow-description">{flow.description}</div>
        <div className="flow-meta">
          <span className="flow-meta-item">
            <span className="flow-meta-icon flow-meta-icon--steps">{"\u25B6"}</span>
            {flow.steps.length} {flow.steps.length === 1 ? "step" : "steps"}
          </span>
        </div>
        <div className="flow-last-used">{formatTime(flow.updatedAt)}</div>
      </div>
      <div className="flow-card-footer">
        <div className="flow-actions-left">
          <button className="btn btn-ghost btn-sm" onClick={onEdit}>Edit</button>
          <button className="btn btn-ghost btn-sm" onClick={onExport}>Export</button>
          <button className="btn btn-ghost btn-sm btn-danger" onClick={onDelete}>Delete</button>
        </div>
        <button className="btn btn-primary btn-sm" onClick={onRun}>Run</button>
      </div>
    </div>
  );
}

export function FlowsView({ onEditFlow, onRunFlow }: FlowsViewProps) {
  const { flows, loading, error, createFlow, deleteFlow, importFlow, exportFlow } = useFlows();
  const [importing, setImporting] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleNewFlow = useCallback(async () => {
    try {
      setOperationError(null);
      const defaultStep: FlowStep = {
        name: "Step 1",
        prompt: "",
        timeoutSecs: null,
      };
      const flow = await createFlow("New Flow", "", [defaultStep]);
      onEditFlow(flow.id);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setOperationError(`Failed to create flow: ${message}`);
    }
  }, [createFlow, onEditFlow]);

  const handleRunFlow = useCallback(
    async (flow: Flow) => {
      const selected = await open({ directory: true });
      if (typeof selected !== "string") return;
      onRunFlow(flow, selected, "claude-code");
    },
    [onRunFlow],
  );

  const handleExportFlow = useCallback(
    async (flowId: string) => {
      try {
        setOperationError(null);
        const json = await exportFlow(flowId);
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "flow.json";
        a.click();
        URL.revokeObjectURL(url);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setOperationError(`Failed to export flow: ${message}`);
      }
    },
    [exportFlow],
  );

  const handleDeleteFlow = useCallback(
    async (flowId: string) => {
      if (!window.confirm("Are you sure you want to delete this flow?")) return;
      try {
        setOperationError(null);
        await deleteFlow(flowId);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setOperationError(`Failed to delete flow: ${message}`);
      }
    },
    [deleteFlow],
  );

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelected = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setImporting(true);
      try {
        setOperationError(null);
        const text = await file.text();
        await importFlow(text);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setOperationError(`Failed to import flow: ${message}`);
      } finally {
        setImporting(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [importFlow],
  );

  if (loading) {
    return (
      <div className="flows-view">
        <div className="flows-loading">Loading flows...</div>
      </div>
    );
  }

  const displayError = operationError ?? error;

  return (
    <div className="flows-view">
      {displayError && (
        <div className="flows-error" role="alert">
          {displayError}
        </div>
      )}
      <div className="flows-header">
        <div className="flows-header-left">
          <h2 className="flows-title">Flows</h2>
          <span className="flows-subtitle">{flows.length} {flows.length === 1 ? "flow" : "flows"}</span>
        </div>
        <div className="flows-header-right">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            style={{ display: "none" }}
            onChange={handleFileSelected}
          />
          <button
            className="btn btn-ghost"
            onClick={handleImportClick}
            disabled={importing}
          >
            Import
          </button>
          <button className="btn btn-primary" onClick={handleNewFlow}>
            + New Flow
          </button>
        </div>
      </div>

      <div className="flows-body">
        {flows.length === 0 ? (
          <div className="flows-empty">
            No flows yet. Create a new flow to get started.
          </div>
        ) : (
          <div className="flow-grid">
            {flows.map((flow) => (
              <FlowCard
                key={flow.id}
                flow={flow}
                onEdit={() => onEditFlow(flow.id)}
                onExport={() => void handleExportFlow(flow.id)}
                onRun={() => void handleRunFlow(flow)}
                onDelete={() => void handleDeleteFlow(flow.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
