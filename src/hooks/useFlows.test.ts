import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useFlows } from "./useFlows";
import type { Flow } from "../types";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";

const mockInvoke = vi.mocked(invoke);

function makeFlow(overrides: Partial<Flow> = {}): Flow {
  return {
    id: "flow-1",
    name: "Test Flow",
    description: "desc",
    steps: [{ name: "Step 1", prompt: "do something", timeoutSecs: null }],
    createdAt: 1000,
    updatedAt: 2000,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useFlows", () => {
  describe("initial load (refresh)", () => {
    it("loads flows on mount and sets loading to false", async () => {
      const flows = [makeFlow()];
      mockInvoke.mockResolvedValueOnce(flows);

      const { result } = renderHook(() => useFlows());

      expect(result.current.loading).toBe(true);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.flows).toEqual(flows);
      expect(result.current.error).toBeNull();
      expect(mockInvoke).toHaveBeenCalledWith("list_flows");
    });

    it("sets error when refresh fails", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("network failure"));

      const { result } = renderHook(() => useFlows());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.flows).toEqual([]);
      expect(result.current.error).toBe("network failure");
    });

    it("sets error from non-Error rejection", async () => {
      mockInvoke.mockRejectedValueOnce("string error");

      const { result } = renderHook(() => useFlows());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe("string error");
    });
  });

  describe("createFlow", () => {
    it("invokes create_flow and refreshes", async () => {
      const created = makeFlow({ id: "new-1", name: "New" });
      // Initial load
      mockInvoke.mockResolvedValueOnce([]);
      const { result } = renderHook(() => useFlows());
      await waitFor(() => expect(result.current.loading).toBe(false));

      // create_flow then list_flows for refresh
      mockInvoke.mockResolvedValueOnce(created);
      mockInvoke.mockResolvedValueOnce([created]);

      let returnedFlow: Flow | undefined;
      await act(async () => {
        returnedFlow = await result.current.createFlow("New", "desc", [
          { name: "S1", prompt: "p", timeoutSecs: null },
        ]);
      });

      expect(returnedFlow).toEqual(created);
      expect(mockInvoke).toHaveBeenCalledWith("create_flow", {
        name: "New",
        description: "desc",
        steps: [{ name: "S1", prompt: "p", timeoutSecs: null }],
      });
      expect(result.current.flows).toEqual([created]);
    });

    it("propagates errors from createFlow", async () => {
      mockInvoke.mockResolvedValueOnce([]);
      const { result } = renderHook(() => useFlows());
      await waitFor(() => expect(result.current.loading).toBe(false));

      mockInvoke.mockRejectedValueOnce(new Error("create failed"));

      await expect(
        act(async () => {
          await result.current.createFlow("X", "", []);
        }),
      ).rejects.toThrow("create failed");
    });
  });

  describe("updateFlow", () => {
    it("invokes update_flow and refreshes", async () => {
      const original = makeFlow();
      const updated = makeFlow({ name: "Updated" });
      mockInvoke.mockResolvedValueOnce([original]);
      const { result } = renderHook(() => useFlows());
      await waitFor(() => expect(result.current.loading).toBe(false));

      mockInvoke.mockResolvedValueOnce(updated);
      mockInvoke.mockResolvedValueOnce([updated]);

      let returnedFlow: Flow | undefined;
      await act(async () => {
        returnedFlow = await result.current.updateFlow(
          "flow-1",
          "Updated",
          "desc",
          original.steps,
        );
      });

      expect(returnedFlow).toEqual(updated);
      expect(mockInvoke).toHaveBeenCalledWith("update_flow", {
        flowId: "flow-1",
        name: "Updated",
        description: "desc",
        steps: original.steps,
      });
    });
  });

  describe("deleteFlow", () => {
    it("invokes delete_flow and refreshes", async () => {
      const flow = makeFlow();
      mockInvoke.mockResolvedValueOnce([flow]);
      const { result } = renderHook(() => useFlows());
      await waitFor(() => expect(result.current.loading).toBe(false));

      mockInvoke.mockResolvedValueOnce(undefined);
      mockInvoke.mockResolvedValueOnce([]);

      await act(async () => {
        await result.current.deleteFlow("flow-1");
      });

      expect(mockInvoke).toHaveBeenCalledWith("delete_flow", {
        flowId: "flow-1",
      });
      expect(result.current.flows).toEqual([]);
    });

    it("propagates errors from deleteFlow", async () => {
      mockInvoke.mockResolvedValueOnce([]);
      const { result } = renderHook(() => useFlows());
      await waitFor(() => expect(result.current.loading).toBe(false));

      mockInvoke.mockRejectedValueOnce(new Error("delete failed"));

      await expect(
        act(async () => {
          await result.current.deleteFlow("flow-1");
        }),
      ).rejects.toThrow("delete failed");
    });
  });

  describe("importFlow", () => {
    it("invokes import_flow and refreshes", async () => {
      const imported = makeFlow({ id: "imp-1" });
      mockInvoke.mockResolvedValueOnce([]);
      const { result } = renderHook(() => useFlows());
      await waitFor(() => expect(result.current.loading).toBe(false));

      mockInvoke.mockResolvedValueOnce(imported);
      mockInvoke.mockResolvedValueOnce([imported]);

      let returnedFlow: Flow | undefined;
      await act(async () => {
        returnedFlow = await result.current.importFlow('{"name":"Test"}');
      });

      expect(returnedFlow).toEqual(imported);
      expect(mockInvoke).toHaveBeenCalledWith("import_flow", {
        json: '{"name":"Test"}',
      });
    });
  });

  describe("exportFlow", () => {
    it("invokes export_flow and returns JSON string", async () => {
      mockInvoke.mockResolvedValueOnce([]);
      const { result } = renderHook(() => useFlows());
      await waitFor(() => expect(result.current.loading).toBe(false));

      mockInvoke.mockResolvedValueOnce('{"id":"flow-1"}');

      let json: string | undefined;
      await act(async () => {
        json = await result.current.exportFlow("flow-1");
      });

      expect(json).toBe('{"id":"flow-1"}');
      expect(mockInvoke).toHaveBeenCalledWith("export_flow", {
        flowId: "flow-1",
      });
    });
  });

  describe("refresh clears previous error", () => {
    it("clears error on successful refresh", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("fail"));
      const { result } = renderHook(() => useFlows());
      await waitFor(() => expect(result.current.error).toBe("fail"));

      mockInvoke.mockResolvedValueOnce([makeFlow()]);
      await act(async () => {
        await result.current.refresh();
      });

      expect(result.current.error).toBeNull();
      expect(result.current.flows).toHaveLength(1);
    });
  });
});
