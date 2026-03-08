import { useState, useCallback, type KeyboardEvent } from "react";
import type { SessionStatus } from "../types";

interface PromptInputProps {
  status: SessionStatus;
  onSend: (prompt: string) => void;
}

export function PromptInput({ status, onSend }: PromptInputProps) {
  const [text, setText] = useState("");
  const isDisabled = status === "running" || status === "terminated";

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    onSend(trimmed);
    setText("");
  }, [text, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className="prompt-input-area">
      <textarea
        className="prompt-textarea"
        rows={3}
        placeholder="Enter a prompt... (Ctrl+Enter to send)"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isDisabled}
      />
      <button
        className="btn btn-primary"
        onClick={handleSend}
        disabled={isDisabled || text.trim().length === 0}
      >
        Send
      </button>
    </div>
  );
}
