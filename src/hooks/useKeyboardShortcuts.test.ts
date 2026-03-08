import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";
import type { KeyboardShortcuts } from "../types";

function makeShortcuts(overrides: Partial<KeyboardShortcuts> = {}): KeyboardShortcuts {
  return {
    sendPrompt: "Ctrl+Enter",
    abort: "Ctrl+C",
    newSession: "Ctrl+N",
    closeSession: "Ctrl+W",
    toggleAutoRun: "Ctrl+Shift+A",
    pauseResume: "Ctrl+Shift+P",
    ...overrides,
  };
}

function makeActions() {
  return {
    sendPrompt: vi.fn(),
    abort: vi.fn(),
    newSession: vi.fn(),
    closeSession: vi.fn(),
    toggleAutoRun: vi.fn(),
    pauseResume: vi.fn(),
  };
}

function fireKeydown(options: KeyboardEventInit) {
  const event = new KeyboardEvent("keydown", { ...options, bubbles: true });
  document.dispatchEvent(event);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useKeyboardShortcuts", () => {
  it("calls sendPrompt on Ctrl+Enter", () => {
    const actions = makeActions();
    renderHook(() => useKeyboardShortcuts(makeShortcuts(), actions));

    fireKeydown({ key: "Enter", ctrlKey: true });
    expect(actions.sendPrompt).toHaveBeenCalledTimes(1);
  });

  it("calls abort on Ctrl+C", () => {
    const actions = makeActions();
    renderHook(() => useKeyboardShortcuts(makeShortcuts(), actions));

    fireKeydown({ key: "c", ctrlKey: true });
    expect(actions.abort).toHaveBeenCalledTimes(1);
  });

  it("calls newSession on Ctrl+N", () => {
    const actions = makeActions();
    renderHook(() => useKeyboardShortcuts(makeShortcuts(), actions));

    fireKeydown({ key: "n", ctrlKey: true });
    expect(actions.newSession).toHaveBeenCalledTimes(1);
  });

  it("calls closeSession on Ctrl+W", () => {
    const actions = makeActions();
    renderHook(() => useKeyboardShortcuts(makeShortcuts(), actions));

    fireKeydown({ key: "w", ctrlKey: true });
    expect(actions.closeSession).toHaveBeenCalledTimes(1);
  });

  it("calls toggleAutoRun on Ctrl+Shift+A", () => {
    const actions = makeActions();
    renderHook(() => useKeyboardShortcuts(makeShortcuts(), actions));

    fireKeydown({ key: "a", ctrlKey: true, shiftKey: true });
    expect(actions.toggleAutoRun).toHaveBeenCalledTimes(1);
  });

  it("calls pauseResume on Ctrl+Shift+P", () => {
    const actions = makeActions();
    renderHook(() => useKeyboardShortcuts(makeShortcuts(), actions));

    fireKeydown({ key: "p", ctrlKey: true, shiftKey: true });
    expect(actions.pauseResume).toHaveBeenCalledTimes(1);
  });

  it("does nothing when shortcuts is null", () => {
    const actions = makeActions();
    renderHook(() => useKeyboardShortcuts(null, actions));

    fireKeydown({ key: "c", ctrlKey: true });
    expect(actions.abort).not.toHaveBeenCalled();
  });

  it("does not fire without modifier keys", () => {
    const actions = makeActions();
    renderHook(() => useKeyboardShortcuts(makeShortcuts(), actions));

    fireKeydown({ key: "c" });
    expect(actions.abort).not.toHaveBeenCalled();
  });

  it("does not call Ctrl+Shift+A when only Ctrl is held", () => {
    const actions = makeActions();
    renderHook(() => useKeyboardShortcuts(makeShortcuts(), actions));

    fireKeydown({ key: "a", ctrlKey: true, shiftKey: false });
    expect(actions.toggleAutoRun).not.toHaveBeenCalled();
  });

  it("supports metaKey as Ctrl alternative", () => {
    const actions = makeActions();
    renderHook(() => useKeyboardShortcuts(makeShortcuts(), actions));

    fireKeydown({ key: "n", metaKey: true });
    expect(actions.newSession).toHaveBeenCalledTimes(1);
  });

  it("removes event listener on unmount", () => {
    const actions = makeActions();
    const { unmount } = renderHook(() =>
      useKeyboardShortcuts(makeShortcuts(), actions),
    );

    unmount();

    fireKeydown({ key: "c", ctrlKey: true });
    expect(actions.abort).not.toHaveBeenCalled();
  });
});
