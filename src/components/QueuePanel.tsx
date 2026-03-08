import { useState, useCallback, useRef, type KeyboardEvent } from "react";
import type { QueueState } from "../types";
import { QueueItem } from "./QueueItem";

interface QueuePanelProps {
  state: QueueState;
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

export function QueuePanel({
  state,
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
}: QueuePanelProps) {
  const [inputText, setInputText] = useState("");
  const dragIndexRef = useRef<number | null>(null);

  const pendingCount = state.items.filter((i) => i.status === "pending").length;
  const completedCount = state.items.filter(
    (i) => i.status === "completed",
  ).length;

  const handleAdd = useCallback(() => {
    const trimmed = inputText.trim();
    if (trimmed.length === 0) return;

    const lines = trimmed.split("\n").filter((line) => line.trim().length > 0);
    if (lines.length > 1) {
      onAddItems(lines.map((l) => l.trim()));
    } else {
      onAddItem(trimmed);
    }
    setInputText("");
  }, [inputText, onAddItem, onAddItems]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleAdd();
      }
    },
    [handleAdd],
  );

  const handleDragStart = useCallback((index: number) => {
    dragIndexRef.current = index;
  }, []);

  const handleDragOver = useCallback(
    (index: number) => {
      if (dragIndexRef.current === null) return;
      if (dragIndexRef.current === index) return;
      onReorder(dragIndexRef.current, index);
      dragIndexRef.current = index;
    },
    [onReorder],
  );

  const handleDragEnd = useCallback(() => {
    dragIndexRef.current = null;
  }, []);

  return (
    <div className="queue-panel">
      <div className="queue-header">
        <div className="queue-header-left">
          <span className="queue-title">Queue</span>
          <span className="queue-count">({pendingCount})</span>
        </div>
        <div className="queue-header-right">
          {state.paused ? (
            <button
              className="btn btn-sm btn-ghost"
              onClick={onResume}
              title="Resume queue"
            >
              Resume
            </button>
          ) : (
            <button
              className="btn btn-sm btn-ghost"
              onClick={onPause}
              title="Pause queue"
            >
              Pause
            </button>
          )}
          <div className="toggle" onClick={onToggleAutoRun}>
            <span className="toggle-label">Auto</span>
            <div className={`toggle-track${state.autoRun ? " on" : ""}`}>
              <div className="toggle-thumb" />
            </div>
          </div>
          {completedCount > 0 && (
            <button
              className="btn btn-sm btn-ghost"
              onClick={onClearCompleted}
              title="Clear completed"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="queue-items">
        {state.items.map((item, index) => (
          <QueueItem
            key={item.id}
            item={item}
            index={index}
            isConfirming={state.confirmingItemId === item.id}
            onRemove={onRemoveItem}
            onEdit={onEditItem}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onRetry={onRetryItem}
            onAbort={onAbort}
            onSetTimeout={onSetItemTimeout}
            onConfirmExecute={onConfirmExecute}
            onConfirmSkip={onConfirmSkip}
          />
        ))}
      </div>

      <div className="queue-input">
        <textarea
          className="queue-textarea"
          rows={3}
          placeholder="Enter prompt... (Ctrl+Enter to add)"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="queue-input-actions">
          <button
            className="btn btn-primary"
            onClick={handleAdd}
            disabled={inputText.trim().length === 0}
          >
            Add to Queue
          </button>
          <span className="queue-bulk-link">
            Separate with newlines for bulk add
          </span>
        </div>
      </div>
    </div>
  );
}
