import { useState, useCallback, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import type { QueueItem as QueueItemType } from "../types";

interface QueueItemProps {
  item: QueueItemType;
  index: number;
  onRemove: (id: string) => void;
  onEdit: (id: string, prompt: string) => void;
  onDragStart: (index: number) => void;
  onDragOver: (index: number) => void;
  onDragEnd: () => void;
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
    case "pending":
      return (
        <span className="queue-status-icon queue-status-icon--pending">
          {"\u25CB"}
        </span>
      );
  }
}

function itemClassName(status: QueueItemType["status"]): string {
  return `queue-item queue-item--${status}`;
}

export function QueueItem({
  item,
  index,
  onRemove,
  onEdit,
  onDragStart,
  onDragOver,
  onDragEnd,
}: QueueItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(item.prompt);

  const isPending = item.status === "pending";

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

  return (
    <div
      className={itemClassName(item.status)}
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
      </div>
      {isPending && !isEditing && (
        <div className="queue-item-actions">
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
      {isPending && (
        <div className="queue-item-drag" title="Drag to reorder">
          {"\u28FF"}
        </div>
      )}
    </div>
  );
}
