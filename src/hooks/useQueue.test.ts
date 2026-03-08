import { describe, it, expect } from "vitest";
import { queueReducer, initialState } from "./useQueue";
import type { QueueAction } from "./useQueue";
import type { QueueState } from "../types";

function dispatch(state: QueueState, action: QueueAction): QueueState {
  return queueReducer(state, action);
}

describe("queueReducer", () => {
  describe("ADD_ITEM", () => {
    it("adds a single item with pending status", () => {
      const next = dispatch(initialState, {
        type: "ADD_ITEM",
        prompt: "Fix the bug",
      });

      expect(next.items).toHaveLength(1);
      expect(next.items[0].prompt).toBe("Fix the bug");
      expect(next.items[0].status).toBe("pending");
      expect(next.items[0].id).toBeTruthy();
    });
  });

  describe("ADD_ITEMS", () => {
    it("adds multiple items at once", () => {
      const next = dispatch(initialState, {
        type: "ADD_ITEMS",
        prompts: ["First", "Second", "Third"],
      });

      expect(next.items).toHaveLength(3);
      expect(next.items[0].prompt).toBe("First");
      expect(next.items[1].prompt).toBe("Second");
      expect(next.items[2].prompt).toBe("Third");
      expect(next.items.every((i) => i.status === "pending")).toBe(true);
    });
  });

  describe("REMOVE_ITEM", () => {
    it("removes an item by id", () => {
      const withItem = dispatch(initialState, {
        type: "ADD_ITEM",
        prompt: "To remove",
      });
      const itemId = withItem.items[0].id;

      const next = dispatch(withItem, { type: "REMOVE_ITEM", id: itemId });

      expect(next.items).toHaveLength(0);
    });

    it("does not remove other items", () => {
      let state = dispatch(initialState, {
        type: "ADD_ITEMS",
        prompts: ["Keep", "Remove"],
      });
      const removeId = state.items[1].id;

      state = dispatch(state, { type: "REMOVE_ITEM", id: removeId });

      expect(state.items).toHaveLength(1);
      expect(state.items[0].prompt).toBe("Keep");
    });
  });

  describe("EDIT_ITEM", () => {
    it("updates the prompt text of an item", () => {
      const withItem = dispatch(initialState, {
        type: "ADD_ITEM",
        prompt: "Original",
      });
      const itemId = withItem.items[0].id;

      const next = dispatch(withItem, {
        type: "EDIT_ITEM",
        id: itemId,
        prompt: "Updated",
      });

      expect(next.items[0].prompt).toBe("Updated");
      expect(next.items[0].id).toBe(itemId);
    });
  });

  describe("REORDER", () => {
    it("moves an item from one position to another", () => {
      const state = dispatch(initialState, {
        type: "ADD_ITEMS",
        prompts: ["A", "B", "C"],
      });

      const next = dispatch(state, {
        type: "REORDER",
        fromIndex: 0,
        toIndex: 2,
      });

      expect(next.items[0].prompt).toBe("B");
      expect(next.items[1].prompt).toBe("C");
      expect(next.items[2].prompt).toBe("A");
    });
  });

  describe("SET_ITEM_STATUS", () => {
    it("updates the status of an item", () => {
      const withItem = dispatch(initialState, {
        type: "ADD_ITEM",
        prompt: "Task",
      });
      const itemId = withItem.items[0].id;

      const running = dispatch(withItem, {
        type: "SET_ITEM_STATUS",
        id: itemId,
        status: "running",
      });
      expect(running.items[0].status).toBe("running");

      const completed = dispatch(running, {
        type: "SET_ITEM_STATUS",
        id: itemId,
        status: "completed",
      });
      expect(completed.items[0].status).toBe("completed");
    });

    it("sets status to failed", () => {
      const withItem = dispatch(initialState, {
        type: "ADD_ITEM",
        prompt: "Failing task",
      });
      const itemId = withItem.items[0].id;

      const failed = dispatch(withItem, {
        type: "SET_ITEM_STATUS",
        id: itemId,
        status: "failed",
      });
      expect(failed.items[0].status).toBe("failed");
    });
  });

  describe("TOGGLE_AUTO_RUN", () => {
    it("toggles autoRun from false to true", () => {
      const next = dispatch(initialState, { type: "TOGGLE_AUTO_RUN" });
      expect(next.autoRun).toBe(true);
    });

    it("toggles autoRun from true to false", () => {
      const on = dispatch(initialState, { type: "TOGGLE_AUTO_RUN" });
      const off = dispatch(on, { type: "TOGGLE_AUTO_RUN" });
      expect(off.autoRun).toBe(false);
    });
  });

  describe("CLEAR_COMPLETED", () => {
    it("removes completed items and keeps others", () => {
      let state = dispatch(initialState, {
        type: "ADD_ITEMS",
        prompts: ["Done", "Pending", "Also done"],
      });

      state = dispatch(state, {
        type: "SET_ITEM_STATUS",
        id: state.items[0].id,
        status: "completed",
      });
      state = dispatch(state, {
        type: "SET_ITEM_STATUS",
        id: state.items[2].id,
        status: "completed",
      });

      const next = dispatch(state, { type: "CLEAR_COMPLETED" });

      expect(next.items).toHaveLength(1);
      expect(next.items[0].prompt).toBe("Pending");
    });
  });
});
