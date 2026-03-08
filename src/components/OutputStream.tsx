import { useEffect, useRef } from "react";
import type { OutputEntry } from "../types";

interface OutputStreamProps {
  outputs: OutputEntry[];
}

function entryClassName(type: OutputEntry["type"]): string {
  return `output-entry output-entry--${type}`;
}

function renderToolUse(entry: OutputEntry) {
  return (
    <div key={entry.id} className={entryClassName(entry.type)}>
      <span className="tool-use-name">{entry.toolName}</span>
      <span className="tool-use-summary">{entry.content}</span>
    </div>
  );
}

function renderToolResult(entry: OutputEntry) {
  return (
    <div key={entry.id} className={entryClassName(entry.type)}>
      {entry.content}
    </div>
  );
}

function renderEntry(entry: OutputEntry) {
  if (entry.type === "tool_use") return renderToolUse(entry);
  if (entry.type === "tool_result") return renderToolResult(entry);
  return (
    <div key={entry.id} className={entryClassName(entry.type)}>
      {entry.content}
    </div>
  );
}

export function OutputStream({ outputs }: OutputStreamProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [outputs.length]);

  return (
    <div className="output-stream">
      {outputs.map(renderEntry)}
      <div ref={bottomRef} />
    </div>
  );
}
