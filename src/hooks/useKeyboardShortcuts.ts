import { useEffect, useCallback } from "react";
import type { KeyboardShortcuts } from "../types";

interface ShortcutActions {
  sendPrompt: () => void;
  abort: () => void;
  newSession: () => void;
  closeSession: () => void;
  toggleAutoRun: () => void;
  pauseResume: () => void;
}

function parseShortcut(shortcut: string): { ctrl: boolean; shift: boolean; key: string } {
  const parts = shortcut.split("+").map((p) => p.trim().toLowerCase());
  const ctrl = parts.includes("ctrl") || parts.includes("meta") || parts.includes("cmd");
  const shift = parts.includes("shift");
  const key = parts.filter((p) => p !== "ctrl" && p !== "meta" && p !== "cmd" && p !== "shift").pop() ?? "";
  return { ctrl, shift, key };
}

function matchesShortcut(
  event: KeyboardEvent,
  shortcut: string,
): boolean {
  const parsed = parseShortcut(shortcut);
  const ctrlPressed = event.ctrlKey || event.metaKey;

  if (parsed.ctrl !== ctrlPressed) return false;
  if (parsed.shift !== event.shiftKey) return false;

  return event.key.toLowerCase() === parsed.key;
}

export function useKeyboardShortcuts(
  shortcuts: KeyboardShortcuts | null,
  actions: ShortcutActions,
) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!shortcuts) return;

      // Skip shortcuts when typing in input/textarea elements
      const target = event.target as HTMLElement;
      const isInputFocused = target.tagName === "INPUT" || target.tagName === "TEXTAREA";

      const entries: [string, () => void][] = [
        [shortcuts.sendPrompt, actions.sendPrompt],
        [shortcuts.abort, actions.abort],
        [shortcuts.newSession, actions.newSession],
        [shortcuts.closeSession, actions.closeSession],
        [shortcuts.toggleAutoRun, actions.toggleAutoRun],
        [shortcuts.pauseResume, actions.pauseResume],
      ];

      for (const [shortcut, action] of entries) {
        if (matchesShortcut(event, shortcut)) {
          // Allow sendPrompt in input contexts, block others
          if (isInputFocused && shortcut !== shortcuts.sendPrompt) {
            continue;
          }
          event.preventDefault();
          action();
          return;
        }
      }
    },
    [shortcuts, actions],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);
}
