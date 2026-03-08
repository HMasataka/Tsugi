import { useEffect, useRef } from "react";
import type { OutputEntry } from "../types";

interface OutputStreamProps {
  outputs: OutputEntry[];
}

function entryClassName(type: OutputEntry["type"]): string {
  return `output-entry output-entry--${type}`;
}

export function OutputStream({ outputs }: OutputStreamProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [outputs.length]);

  return (
    <div className="output-stream">
      {outputs.map((entry) => (
        <div key={entry.id} className={entryClassName(entry.type)}>
          {entry.content}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
