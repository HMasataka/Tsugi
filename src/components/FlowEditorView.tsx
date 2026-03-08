import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { Flow, FlowStep, FlowStepType, CliType } from "../types";

interface FlowEditorViewProps {
  flowId: string;
  onBack: () => void;
  onRunFlow: (flow: Flow, cwd: string, cliType: CliType) => void;
}

function createEmptyStep(index: number): FlowStep {
  return {
    name: `Step ${index}`,
    stepType: "prompt",
    prompt: "",
    timeoutSecs: null,
  };
}

export function FlowEditorView({ flowId, onBack, onRunFlow }: FlowEditorViewProps) {
  const [flow, setFlow] = useState<Flow | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState<FlowStep[]>([]);
  const [selectedStepIndex, setSelectedStepIndex] = useState(0);
  const [saving, setSaving] = useState(false);

  // Track the last-saved snapshot to detect unsaved changes
  const savedSnapshotRef = useRef<{ name: string; description: string; steps: FlowStep[] } | null>(null);

  useEffect(() => {
    void invoke<Flow>("get_flow", { flowId })
      .then((f) => {
        setFlow(f);
        setName(f.name);
        setDescription(f.description);
        setSteps(f.steps);
        setSelectedStepIndex(0);
        savedSnapshotRef.current = { name: f.name, description: f.description, steps: f.steps };
      })
      .catch((e) => {
        const message = e instanceof Error ? e.message : String(e);
        setLoadError(message);
      });
  }, [flowId]);

  const hasUnsavedChanges = useCallback((): boolean => {
    if (!savedSnapshotRef.current) return false;
    const saved = savedSnapshotRef.current;
    return (
      saved.name !== name ||
      saved.description !== description ||
      JSON.stringify(saved.steps) !== JSON.stringify(steps)
    );
  }, [name, description, steps]);

  const handleBack = useCallback(() => {
    if (hasUnsavedChanges()) {
      if (!window.confirm("You have unsaved changes. Are you sure you want to leave?")) return;
    }
    onBack();
  }, [hasUnsavedChanges, onBack]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      setOperationError(null);
      const updated = await invoke<Flow>("update_flow", {
        flowId,
        name,
        description,
        steps,
      });
      setFlow(updated);
      savedSnapshotRef.current = { name, description, steps };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setOperationError(`Failed to save flow: ${message}`);
    } finally {
      setSaving(false);
    }
  }, [flowId, name, description, steps]);

  const handleDelete = useCallback(async () => {
    if (!window.confirm("Are you sure you want to delete this flow?")) return;
    try {
      setOperationError(null);
      await invoke("delete_flow", { flowId });
      onBack();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setOperationError(`Failed to delete flow: ${message}`);
    }
  }, [flowId, onBack]);

  const handleRun = useCallback(async () => {
    if (!flow) return;
    const selected = await open({ directory: true });
    if (typeof selected !== "string") return;

    try {
      setOperationError(null);
      const updated = await invoke<Flow>("update_flow", {
        flowId,
        name,
        description,
        steps,
      });
      savedSnapshotRef.current = { name, description, steps };
      onRunFlow(updated, selected, "claude-code");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setOperationError(`Failed to run flow: ${message}`);
    }
  }, [flow, flowId, name, description, steps, onRunFlow]);

  const handleAddStep = useCallback(() => {
    const newStep = createEmptyStep(steps.length + 1);
    setSteps([...steps, newStep]);
    setSelectedStepIndex(steps.length);
  }, [steps]);

  const handleRemoveStep = useCallback(
    (index: number) => {
      if (steps.length <= 1) return;
      const newSteps = steps.filter((_, i) => i !== index);
      setSteps(newSteps);
      if (selectedStepIndex >= newSteps.length) {
        setSelectedStepIndex(newSteps.length - 1);
      }
    },
    [steps, selectedStepIndex],
  );

  const handleMoveStep = useCallback(
    (fromIndex: number, direction: -1 | 1) => {
      const toIndex = fromIndex + direction;
      if (toIndex < 0 || toIndex >= steps.length) return;
      const newSteps = [...steps];
      const [moved] = newSteps.splice(fromIndex, 1);
      newSteps.splice(toIndex, 0, moved);
      setSteps(newSteps);
      setSelectedStepIndex(toIndex);
    },
    [steps],
  );

  const handleUpdateStep = useCallback(
    (index: number, field: keyof FlowStep, value: string | number | null | FlowStep[] | undefined) => {
      setSteps(
        steps.map((s, i) => (i === index ? { ...s, [field]: value } : s)),
      );
    },
    [steps],
  );

  const stepTypeLabel = (t: FlowStepType): string => {
    switch (t) {
      case "prompt": return "Prompt";
      case "condition": return "Condition";
      case "loop": return "Loop";
      case "validation": return "Validation";
      case "approval": return "Approval";
    }
  };

  if (loadError) {
    return (
      <div className="flow-editor-view">
        <div className="flows-error" role="alert">Failed to load flow: {loadError}</div>
        <button className="btn" onClick={onBack}>Back to Flows</button>
      </div>
    );
  }

  if (!flow) {
    return (
      <div className="flow-editor-view">
        <div className="flows-loading">Loading flow...</div>
      </div>
    );
  }

  const selectedStep = steps[selectedStepIndex];

  return (
    <div className="flow-editor-view">
      {operationError && (
        <div className="flows-error" role="alert">
          {operationError}
        </div>
      )}
      <div className="flow-editor-header">
        <div className="flow-editor-header-left">
          <button className="back-link" onClick={handleBack}>
            {"\u2190"} Flows
          </button>
          <input
            className="flow-name-input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="flow-editor-header-right">
          <button className="btn btn-danger" onClick={() => void handleDelete()}>
            Delete
          </button>
          <button className="btn" onClick={() => void handleSave()} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
          <button className="btn btn-primary" onClick={() => void handleRun()}>
            Run
          </button>
        </div>
      </div>

      <div className="flow-editor-description">
        <input
          className="flow-description-input"
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Flow description"
        />
      </div>

      <div className="flow-editor-split">
        <div className="flow-step-list-pane">
          <div className="pane-header">
            <span className="pane-title">Steps</span>
          </div>
          <div className="flow-step-toolbar">
            <button className="btn btn-sm" onClick={handleAddStep}>+ Step</button>
          </div>
          <div className="pane-body flow-step-list-body">
            <div className="flow-step-tree">
              {steps.map((step, index) => (
                <div
                  key={index}
                  className={`flow-step-item flow-step-type-${step.stepType}${index === selectedStepIndex ? " selected" : ""}`}
                  onClick={() => setSelectedStepIndex(index)}
                >
                  <div className="flow-step-connector">
                    <div className="flow-step-dot" />
                    {index < steps.length - 1 && <div className="flow-step-line" />}
                  </div>
                  <div className="flow-step-card">
                    <div className="flow-step-card-header">
                      <span className="flow-step-number">{index + 1}</span>
                      <span className="flow-step-label">{stepTypeLabel(step.stepType)}:</span>
                      <span className="flow-step-name">{step.name}</span>
                    </div>
                    <div className="flow-step-preview">
                      {step.prompt.slice(0, 60) || "(empty prompt)"}
                    </div>
                    <div className="flow-step-item-actions">
                      <button
                        className="queue-item-action-btn"
                        title="Move up"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMoveStep(index, -1);
                        }}
                        disabled={index === 0}
                      >
                        {"\u2191"}
                      </button>
                      <button
                        className="queue-item-action-btn"
                        title="Move down"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMoveStep(index, 1);
                        }}
                        disabled={index === steps.length - 1}
                      >
                        {"\u2193"}
                      </button>
                      <button
                        className="queue-item-action-btn"
                        title="Remove"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveStep(index);
                        }}
                        disabled={steps.length <= 1}
                      >
                        {"\u00D7"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flow-step-detail-pane">
          <div className="pane-header">
            <span className="pane-title">Step Detail</span>
            {selectedStep && (
              <span className="badge badge-idle">{selectedStep.name}</span>
            )}
          </div>
          {selectedStep && (
            <div className="pane-body flow-step-detail-body">
              <div className="detail-form">
                <div className="form-group">
                  <label className="form-label">Name</label>
                  <input
                    type="text"
                    className="form-value"
                    value={selectedStep.name}
                    onChange={(e) =>
                      handleUpdateStep(selectedStepIndex, "name", e.target.value)
                    }
                    style={{ cursor: "text" }}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Type</label>
                  <select
                    className="form-value"
                    value={selectedStep.stepType}
                    onChange={(e) =>
                      handleUpdateStep(selectedStepIndex, "stepType", e.target.value)
                    }
                  >
                    <option value="prompt">Prompt</option>
                    <option value="condition">Condition</option>
                    <option value="loop">Loop</option>
                    <option value="validation">Validation</option>
                    <option value="approval">Approval</option>
                  </select>
                </div>

                {(selectedStep.stepType) !== "approval" && (
                  <div className="form-group">
                    <label className="form-label">Prompt</label>
                    <textarea
                      className="prompt-textarea"
                      rows={8}
                      value={selectedStep.prompt}
                      onChange={(e) =>
                        handleUpdateStep(selectedStepIndex, "prompt", e.target.value)
                      }
                    />
                  </div>
                )}

                {(selectedStep.stepType) === "condition" && (
                  <div className="form-group">
                    <label className="form-label">Condition Prompt</label>
                    <textarea
                      className="prompt-textarea"
                      rows={4}
                      value={selectedStep.conditionPrompt ?? ""}
                      onChange={(e) =>
                        handleUpdateStep(selectedStepIndex, "conditionPrompt", e.target.value)
                      }
                      placeholder="Ask a yes/no question about the previous output"
                    />
                  </div>
                )}

                {(selectedStep.stepType) === "loop" && (
                  <>
                    <div className="form-group">
                      <label className="form-label">Loop Condition Prompt</label>
                      <textarea
                        className="prompt-textarea"
                        rows={4}
                        value={selectedStep.loopConditionPrompt ?? ""}
                        onChange={(e) =>
                          handleUpdateStep(selectedStepIndex, "loopConditionPrompt", e.target.value)
                        }
                        placeholder="Condition to continue looping (yes = continue)"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Max Iterations</label>
                      <input
                        type="number"
                        className="form-value"
                        value={selectedStep.maxIterations ?? ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          const parsed = parseInt(val, 10);
                          handleUpdateStep(
                            selectedStepIndex,
                            "maxIterations",
                            val === "" || isNaN(parsed) ? null : parsed,
                          );
                        }}
                        placeholder="10"
                        style={{ cursor: "text", width: 120 }}
                      />
                    </div>
                  </>
                )}

                {(selectedStep.stepType) === "validation" && (
                  <>
                    <div className="form-group">
                      <label className="form-label">Validation Pattern (regex)</label>
                      <input
                        type="text"
                        className="form-value"
                        value={selectedStep.validationPattern ?? ""}
                        onChange={(e) =>
                          handleUpdateStep(selectedStepIndex, "validationPattern", e.target.value)
                        }
                        placeholder="e.g. ^\\{.*\\}$"
                        style={{ cursor: "text" }}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Max Retries</label>
                      <input
                        type="number"
                        className="form-value"
                        value={selectedStep.maxRetries ?? ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          const parsed = parseInt(val, 10);
                          handleUpdateStep(
                            selectedStepIndex,
                            "maxRetries",
                            val === "" || isNaN(parsed) ? null : parsed,
                          );
                        }}
                        placeholder="3"
                        style={{ cursor: "text", width: 120 }}
                      />
                    </div>
                  </>
                )}

                <div className="form-group">
                  <label className="form-label">Timeout</label>
                  <div className="timeout-input-wrap">
                    <input
                      type="number"
                      className="form-value"
                      value={selectedStep.timeoutSecs ?? ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        const parsed = parseInt(val, 10);
                        handleUpdateStep(
                          selectedStepIndex,
                          "timeoutSecs",
                          val === "" || isNaN(parsed) ? null : parsed,
                        );
                      }}
                      placeholder="No timeout"
                      style={{ cursor: "text", width: 120 }}
                    />
                    <span className="input-suffix">seconds</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
