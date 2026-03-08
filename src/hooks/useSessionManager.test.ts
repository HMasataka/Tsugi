import { describe, it, expect } from "vitest";
import { sessionManagerReducer, initialManagerState } from "./useSessionManager";
import type { SessionManagerAction } from "./useSessionManager";
import type { SessionManagerState } from "../types";

function dispatch(
  state: SessionManagerState,
  action: SessionManagerAction,
): SessionManagerState {
  return sessionManagerReducer(state, action);
}

describe("sessionManagerReducer", () => {
  describe("ADD_SESSION", () => {
    it("adds a session and sets it as active", () => {
      const next = dispatch(initialManagerState, {
        type: "ADD_SESSION",
        id: "session-1",
        cwd: "/tmp/test",
        cliType: "claude-code",
      });

      expect(next.sessions).toHaveLength(1);
      expect(next.sessions[0].id).toBe("session-1");
      expect(next.sessions[0].state.cwd).toBe("/tmp/test");
      expect(next.sessions[0].state.cliType).toBe("claude-code");
      expect(next.sessions[0].state.status).toBe("idle");
      expect(next.activeSessionId).toBe("session-1");
    });

    it("switches active to the newly added session", () => {
      let state = dispatch(initialManagerState, {
        type: "ADD_SESSION",
        id: "session-1",
        cwd: "/tmp/a",
        cliType: "claude-code",
      });
      state = dispatch(state, {
        type: "ADD_SESSION",
        id: "session-2",
        cwd: "/tmp/b",
        cliType: "claude-code",
      });

      expect(state.sessions).toHaveLength(2);
      expect(state.activeSessionId).toBe("session-2");
    });
  });

  describe("REMOVE_SESSION", () => {
    it("removes a session by id", () => {
      let state = dispatch(initialManagerState, {
        type: "ADD_SESSION",
        id: "session-1",
        cwd: "/tmp/a",
        cliType: "claude-code",
      });
      state = dispatch(state, { type: "REMOVE_SESSION", sessionId: "session-1" });

      expect(state.sessions).toHaveLength(0);
      expect(state.activeSessionId).toBeNull();
    });

    it("switches active to last remaining session when active is removed", () => {
      let state = dispatch(initialManagerState, {
        type: "ADD_SESSION",
        id: "session-1",
        cwd: "/tmp/a",
        cliType: "claude-code",
      });
      state = dispatch(state, {
        type: "ADD_SESSION",
        id: "session-2",
        cwd: "/tmp/b",
        cliType: "claude-code",
      });
      state = dispatch(state, { type: "REMOVE_SESSION", sessionId: "session-2" });

      expect(state.activeSessionId).toBe("session-1");
    });
  });

  describe("SET_ACTIVE", () => {
    it("changes the active session", () => {
      let state = dispatch(initialManagerState, {
        type: "ADD_SESSION",
        id: "session-1",
        cwd: "/tmp/a",
        cliType: "claude-code",
      });
      state = dispatch(state, {
        type: "ADD_SESSION",
        id: "session-2",
        cwd: "/tmp/b",
        cliType: "claude-code",
      });
      state = dispatch(state, { type: "SET_ACTIVE", sessionId: "session-1" });

      expect(state.activeSessionId).toBe("session-1");
    });
  });

  describe("SESSION_SET_RUNNING", () => {
    it("sets session status to running", () => {
      let state = dispatch(initialManagerState, {
        type: "ADD_SESSION",
        id: "session-1",
        cwd: "/tmp/a",
        cliType: "claude-code",
      });
      state = dispatch(state, {
        type: "SESSION_SET_RUNNING",
        sessionId: "session-1",
      });

      expect(state.sessions[0].state.status).toBe("running");
    });
  });

  describe("SESSION_ADD_OUTPUT", () => {
    it("adds an output entry to the session", () => {
      let state = dispatch(initialManagerState, {
        type: "ADD_SESSION",
        id: "session-1",
        cwd: "/tmp/a",
        cliType: "claude-code",
      });
      state = dispatch(state, {
        type: "SESSION_ADD_OUTPUT",
        sessionId: "session-1",
        entry: {
          id: "out-1",
          type: "text",
          content: "Hello",
          timestamp: 1000,
        },
      });

      expect(state.sessions[0].state.outputs).toHaveLength(1);
      expect(state.sessions[0].state.outputs[0].content).toBe("Hello");
    });
  });

  describe("SESSION_SET_IDLE", () => {
    it("sets session status to idle", () => {
      let state = dispatch(initialManagerState, {
        type: "ADD_SESSION",
        id: "session-1",
        cwd: "/tmp/a",
        cliType: "claude-code",
      });
      state = dispatch(state, {
        type: "SESSION_SET_RUNNING",
        sessionId: "session-1",
      });
      state = dispatch(state, {
        type: "SESSION_SET_IDLE",
        sessionId: "session-1",
      });

      expect(state.sessions[0].state.status).toBe("idle");
    });
  });

  describe("SESSION_SET_TERMINATED", () => {
    it("sets session status to terminated", () => {
      let state = dispatch(initialManagerState, {
        type: "ADD_SESSION",
        id: "session-1",
        cwd: "/tmp/a",
        cliType: "claude-code",
      });
      state = dispatch(state, {
        type: "SESSION_SET_TERMINATED",
        sessionId: "session-1",
      });

      expect(state.sessions[0].state.status).toBe("terminated");
    });
  });

  describe("Queue actions", () => {
    function stateWithSession(): SessionManagerState {
      return dispatch(initialManagerState, {
        type: "ADD_SESSION",
        id: "session-1",
        cwd: "/tmp/a",
        cliType: "claude-code",
      });
    }

    it("QUEUE_ADD_ITEM adds an item to the session queue", () => {
      const state = dispatch(stateWithSession(), {
        type: "QUEUE_ADD_ITEM",
        sessionId: "session-1",
        prompt: "Test prompt",
      });

      expect(state.sessions[0].queueState.items).toHaveLength(1);
      expect(state.sessions[0].queueState.items[0].prompt).toBe("Test prompt");
      expect(state.sessions[0].queueState.items[0].status).toBe("pending");
    });

    it("QUEUE_ADD_ITEMS adds multiple items", () => {
      const state = dispatch(stateWithSession(), {
        type: "QUEUE_ADD_ITEMS",
        sessionId: "session-1",
        prompts: ["A", "B", "C"],
      });

      expect(state.sessions[0].queueState.items).toHaveLength(3);
    });

    it("QUEUE_REMOVE_ITEM removes an item by id", () => {
      let state = dispatch(stateWithSession(), {
        type: "QUEUE_ADD_ITEM",
        sessionId: "session-1",
        prompt: "Remove me",
      });
      const itemId = state.sessions[0].queueState.items[0].id;
      state = dispatch(state, {
        type: "QUEUE_REMOVE_ITEM",
        sessionId: "session-1",
        itemId,
      });

      expect(state.sessions[0].queueState.items).toHaveLength(0);
    });

    it("QUEUE_TOGGLE_AUTO_RUN toggles autoRun", () => {
      const state = dispatch(stateWithSession(), {
        type: "QUEUE_TOGGLE_AUTO_RUN",
        sessionId: "session-1",
      });

      expect(state.sessions[0].queueState.autoRun).toBe(true);
    });

    it("QUEUE_PAUSE sets paused to true", () => {
      const state = dispatch(stateWithSession(), {
        type: "QUEUE_PAUSE",
        sessionId: "session-1",
      });

      expect(state.sessions[0].queueState.paused).toBe(true);
    });

    it("QUEUE_RESUME sets paused to false", () => {
      let state = dispatch(stateWithSession(), {
        type: "QUEUE_PAUSE",
        sessionId: "session-1",
      });
      state = dispatch(state, {
        type: "QUEUE_RESUME",
        sessionId: "session-1",
      });

      expect(state.sessions[0].queueState.paused).toBe(false);
    });

    it("QUEUE_SET_ITEM_STATUS updates item status", () => {
      let state = dispatch(stateWithSession(), {
        type: "QUEUE_ADD_ITEM",
        sessionId: "session-1",
        prompt: "Task",
      });
      const itemId = state.sessions[0].queueState.items[0].id;
      state = dispatch(state, {
        type: "QUEUE_SET_ITEM_STATUS",
        sessionId: "session-1",
        itemId,
        status: "running",
      });

      expect(state.sessions[0].queueState.items[0].status).toBe("running");
    });

    it("QUEUE_EDIT_ITEM updates item prompt", () => {
      let state = dispatch(stateWithSession(), {
        type: "QUEUE_ADD_ITEM",
        sessionId: "session-1",
        prompt: "Original",
      });
      const itemId = state.sessions[0].queueState.items[0].id;
      state = dispatch(state, {
        type: "QUEUE_EDIT_ITEM",
        sessionId: "session-1",
        itemId,
        prompt: "Updated",
      });

      expect(state.sessions[0].queueState.items[0].prompt).toBe("Updated");
    });

    it("QUEUE_REORDER moves items", () => {
      let state = dispatch(stateWithSession(), {
        type: "QUEUE_ADD_ITEMS",
        sessionId: "session-1",
        prompts: ["A", "B", "C"],
      });
      state = dispatch(state, {
        type: "QUEUE_REORDER",
        sessionId: "session-1",
        fromIndex: 0,
        toIndex: 2,
      });

      expect(state.sessions[0].queueState.items[0].prompt).toBe("B");
      expect(state.sessions[0].queueState.items[2].prompt).toBe("A");
    });

    it("QUEUE_CLEAR_COMPLETED removes completed items", () => {
      let state = dispatch(stateWithSession(), {
        type: "QUEUE_ADD_ITEMS",
        sessionId: "session-1",
        prompts: ["Done", "Pending"],
      });
      const doneId = state.sessions[0].queueState.items[0].id;
      state = dispatch(state, {
        type: "QUEUE_SET_ITEM_STATUS",
        sessionId: "session-1",
        itemId: doneId,
        status: "completed",
      });
      state = dispatch(state, {
        type: "QUEUE_CLEAR_COMPLETED",
        sessionId: "session-1",
      });

      expect(state.sessions[0].queueState.items).toHaveLength(1);
      expect(state.sessions[0].queueState.items[0].prompt).toBe("Pending");
    });

    it("QUEUE_SKIP_ITEM sets item to skipped", () => {
      let state = dispatch(stateWithSession(), {
        type: "QUEUE_ADD_ITEM",
        sessionId: "session-1",
        prompt: "Skip me",
      });
      const itemId = state.sessions[0].queueState.items[0].id;
      state = dispatch(state, {
        type: "QUEUE_SKIP_ITEM",
        sessionId: "session-1",
        itemId,
      });

      expect(state.sessions[0].queueState.items[0].status).toBe("skipped");
    });

    it("QUEUE_RETRY_ITEM resets failed item to pending", () => {
      let state = dispatch(stateWithSession(), {
        type: "QUEUE_ADD_ITEM",
        sessionId: "session-1",
        prompt: "Retry me",
      });
      const itemId = state.sessions[0].queueState.items[0].id;
      state = dispatch(state, {
        type: "QUEUE_SET_ITEM_STATUS",
        sessionId: "session-1",
        itemId,
        status: "failed",
      });
      state = dispatch(state, {
        type: "QUEUE_RETRY_ITEM",
        sessionId: "session-1",
        itemId,
      });

      expect(state.sessions[0].queueState.items[0].status).toBe("pending");
    });

    it("QUEUE_SET_TIMEOUT sets timeout on item", () => {
      let state = dispatch(stateWithSession(), {
        type: "QUEUE_ADD_ITEM",
        sessionId: "session-1",
        prompt: "Timeout test",
      });
      const itemId = state.sessions[0].queueState.items[0].id;
      state = dispatch(state, {
        type: "QUEUE_SET_TIMEOUT",
        sessionId: "session-1",
        itemId,
        timeoutMs: 30000,
      });

      expect(state.sessions[0].queueState.items[0].timeoutMs).toBe(30000);
    });

    it("QUEUE_CONFIRM_ITEM sets confirmingItemId", () => {
      let state = dispatch(stateWithSession(), {
        type: "QUEUE_ADD_ITEM",
        sessionId: "session-1",
        prompt: "Confirm me",
      });
      const itemId = state.sessions[0].queueState.items[0].id;
      state = dispatch(state, {
        type: "QUEUE_CONFIRM_ITEM",
        sessionId: "session-1",
        itemId,
      });

      expect(state.sessions[0].queueState.confirmingItemId).toBe(itemId);
    });

    it("QUEUE_CLEAR_CONFIRMING resets confirmingItemId", () => {
      let state = dispatch(stateWithSession(), {
        type: "QUEUE_ADD_ITEM",
        sessionId: "session-1",
        prompt: "Confirm me",
      });
      const itemId = state.sessions[0].queueState.items[0].id;
      state = dispatch(state, {
        type: "QUEUE_CONFIRM_ITEM",
        sessionId: "session-1",
        itemId,
      });
      state = dispatch(state, {
        type: "QUEUE_CLEAR_CONFIRMING",
        sessionId: "session-1",
      });

      expect(state.sessions[0].queueState.confirmingItemId).toBeNull();
    });
  });

  describe("session independence", () => {
    it("queue actions only affect the targeted session", () => {
      let state = dispatch(initialManagerState, {
        type: "ADD_SESSION",
        id: "session-1",
        cwd: "/tmp/a",
        cliType: "claude-code",
      });
      state = dispatch(state, {
        type: "ADD_SESSION",
        id: "session-2",
        cwd: "/tmp/b",
        cliType: "claude-code",
      });
      state = dispatch(state, {
        type: "QUEUE_ADD_ITEM",
        sessionId: "session-1",
        prompt: "Only in session 1",
      });

      expect(state.sessions[0].queueState.items).toHaveLength(1);
      expect(state.sessions[1].queueState.items).toHaveLength(0);
    });

    it("session status changes only affect the targeted session", () => {
      let state = dispatch(initialManagerState, {
        type: "ADD_SESSION",
        id: "session-1",
        cwd: "/tmp/a",
        cliType: "claude-code",
      });
      state = dispatch(state, {
        type: "ADD_SESSION",
        id: "session-2",
        cwd: "/tmp/b",
        cliType: "claude-code",
      });
      state = dispatch(state, {
        type: "SESSION_SET_RUNNING",
        sessionId: "session-1",
      });

      expect(state.sessions[0].state.status).toBe("running");
      expect(state.sessions[1].state.status).toBe("idle");
    });
  });
});
