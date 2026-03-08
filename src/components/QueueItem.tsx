import { useState, useCallback, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import type { QueueItem as QueueItemType } from "../types";

interface QueueItemProps {
  item: QueueItemType;
  index: number;
  isConfirming: boolean;
  onRemove: (id: string) => void;
  onEdit: (id: string, prompt: string) => void;
  onDragStart: (index: number) => void;
  onDragOver: (index: number) => void;
  onDragEnd: () => void;
  onRetry: (id: string) => void;
  onAbort: () => void;
  onSetTimeout: (id: string, timeoutMs: number | null) => void;
  onConfirmExecute: (id: string) => void;
  onConfirmSkip: (id: string) => void;
}

function statusIcon(status: QueueItemType["status"]): ReactNode {
  switch (status) {
    case "completed":
      return (
        <span className="queue-status-icon queue-status-icon--completed">
          {"\u2713"}
        </span>
      );
    case "running":
      return <span className="spinner spinner--amber" />;
    case "failed":
      return (
        <span className="queue-status-icon queue-status-icon--failed">
          {"\u2717"}
        </span>
      );
    case "skipped":
      return (
        <span className="queue-status-icon queue-status-icon--skipped">
          {"\u21B7"}
        </span>
      );
    case "pending":
      return (
        <span className="queue-status-icon queue-status-icon--pending">
          {"\u25CB"}
        </span>
      );
  }
}

function itemClassName(status: QueueItemType["status"], isConfirming: boolean): string {
  const base = `queue-item queue-item--${status}`;
  return isConfirming ? `${base} queue-item--confirming` : base;
}

export function QueueItem({
  item,
  index,
  isConfirming,
  onRemove,
  onEdit,
  onDragStart,
  onDragOver,
  onDragEnd,
  onRetry,
  onAbort,
  onSetTimeout,
  onConfirmExecute,
  onConfirmSkip,
}: QueueItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(item.prompt);
  const [timeoutInput, setTimeoutInput] = useState("");

  const isPending = item.status === "pending";
  const isRunning = item.status === "running";
  const isFailed = item.status === "failed";
  const isSkipped = item.status === "skipped";

  const handleDragStart = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.dataTransfer.effectAllowed = "move";
      onDragStart(index);
    },
    [index, onDragStart],
  );

  const handleDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      onDragOver(index);
    },
    [index, onDragOver],
  );

  const handleEditSubmit = useCallback(() => {
    const trimmed = editText.trim();
    if (trimmed.length > 0) {
      onEdit(item.id, trimmed);
    }
    setIsEditing(false);
  }, [editText, item.id, onEdit]);

  const handleEditKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleEditSubmit();
      }
      if (e.key === "Escape") {
        setEditText(item.prompt);
        setIsEditing(false);
      }
    },
    [handleEditSubmit, item.prompt],
  );

  const handleStartEdit = useCallback(() => {
    setEditText(item.prompt);
    setIsEditing(true);
  }, [item.prompt]);

  const handleTimeoutSubmit = useCallback(() => {
    const seconds = parseInt(timeoutInput, 10);
    if (isNaN(seconds) || seconds <= 0) {
      onSetTimeout(item.id, null);
      setTimeoutInput("");
    } else {
      onSetTimeout(item.id, seconds * 1000);
      setTimeoutInput("");
    }
  }, [timeoutInput, item.id, onSetTimeout]);

  const handleTimeoutKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleTimeoutSubmit();
      }
    },
    [handleTimeoutSubmit],
  );

  return (
    <div
      className={itemClassName(item.status, isConfirming)}
      draggable={isPending}
      onDragStart={isPending ? handleDragStart : undefined}
      onDragOver={isPending ? handleDragOver : undefined}
      onDragEnd={isPending ? onDragEnd : undefined}
    >
      <div className="queue-item-status">{statusIcon(item.status)}</div>
      <div className="queue-item-content">
        {isEditing ? (
          <input
            className="queue-item-edit-input"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onBlur={handleEditSubmit}
            onKeyDown={handleEditKeyDown}
            autoFocus
          />
        ) : (
          <span className="queue-item-text">{item.prompt}</span>
        )}
        {isPending && item.timeoutMs && (
          <span className="queue-item-timeout-badge">
            {item.timeoutMs / 1000}s
          </span>
        )}
      </div>

      {isConfirming && (
        <div className="queue-item-confirm-bar">
          <button
            className="btn btn-sm btn-primary"
            onClick={() => onConfirmExecute(item.id)}
          >
            Execute
          </button>
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => onConfirmSkip(item.id)}
          >
            Skip
          </button>
        </div>
      )}

      {isPending && !isEditing && !isConfirming && (
        <div className="queue-item-actions">
          <input
            className="queue-item-timeout-input"
            type="number"
            min="1"
            placeholder="sec"
            value={timeoutInput}
            onChange={(e) => setTimeoutInput(e.target.value)}
            onBlur={handleTimeoutSubmit}
            onKeyDown={handleTimeoutKeyDown}
            title="Timeout in seconds"
          />
          <button
            className="queue-item-action-btn"
            onClick={handleStartEdit}
            title="Edit"
          >
            {"\u270E"}
          </button>
          <button
            className="queue-item-action-btn"
            onClick={() => onRemove(item.id)}
            title="Remove"
          >
            {"\u2715"}
          </button>
        </div>
      )}

      {isRunning && (
        <div className="queue-item-actions">
          <button
            className="btn btn-sm btn-danger"
            onClick={onAbort}
            title="Abort"
          >
            Abort
          </button>
        </div>
      )}

      {(isFailed || isSkipped) && (
        <div className="queue-item-actions">
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => onRetry(item.id)}
            title="Retry"
          >
            Retry
          </button>
        </div>
      )}

      {isPending && (
        <div className="queue-item-drag" title="Drag to reorder">
          {"\u28FF"}
        </div>
      )}
    </div>
  );
}
