import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useSettings } from "./useSettings";
import type { Settings } from "../types";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";

const mockInvoke = vi.mocked(invoke);

function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    defaultCliType: "claude-code",
    defaultExecutionMode: "auto",
    defaultTimeoutSecs: 300,
    autoRetryOnFailure: false,
    notifyOnCompletion: true,
    notifyOnError: true,
    notifyOnApproval: true,
    autoWorktreeForFlows: false,
    keyboardShortcuts: {
      sendPrompt: "Ctrl+Enter",
      abort: "Ctrl+C",
      newSession: "Ctrl+N",
      closeSession: "Ctrl+W",
      toggleAutoRun: "Ctrl+Shift+A",
      pauseResume: "Ctrl+Shift+P",
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useSettings", () => {
  describe("initial load", () => {
    it("loads settings on mount and sets loading to false", async () => {
      const settings = makeSettings();
      mockInvoke.mockResolvedValueOnce(settings);

      const { result } = renderHook(() => useSettings());

      expect(result.current.loading).toBe(true);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.settings).toEqual(settings);
      expect(result.current.error).toBeNull();
      expect(mockInvoke).toHaveBeenCalledWith("get_settings");
    });

    it("sets error when load fails", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("load failed"));

      const { result } = renderHook(() => useSettings());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.settings).toBeNull();
      expect(result.current.error).toBe("load failed");
    });

    it("sets error from non-Error rejection", async () => {
      mockInvoke.mockRejectedValueOnce("string error");

      const { result } = renderHook(() => useSettings());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe("string error");
    });
  });

  describe("updateSettings", () => {
    it("invokes update_settings and updates state", async () => {
      const initial = makeSettings();
      mockInvoke.mockResolvedValueOnce(initial);

      const { result } = renderHook(() => useSettings());
      await waitFor(() => expect(result.current.loading).toBe(false));

      const updated = makeSettings({ defaultCliType: "codex", defaultTimeoutSecs: 600 });
      mockInvoke.mockResolvedValueOnce(updated);

      let returnedSettings: Settings | undefined;
      await act(async () => {
        returnedSettings = await result.current.updateSettings(updated);
      });

      expect(returnedSettings).toEqual(updated);
      expect(mockInvoke).toHaveBeenCalledWith("update_settings", {
        settings: updated,
      });
      expect(result.current.settings).toEqual(updated);
    });

    it("propagates errors from updateSettings", async () => {
      const initial = makeSettings();
      mockInvoke.mockResolvedValueOnce(initial);

      const { result } = renderHook(() => useSettings());
      await waitFor(() => expect(result.current.loading).toBe(false));

      mockInvoke.mockRejectedValueOnce(new Error("update failed"));

      await expect(
        act(async () => {
          await result.current.updateSettings(makeSettings());
        }),
      ).rejects.toThrow("update failed");
    });
  });

  describe("refresh clears previous error", () => {
    it("clears error on successful refresh", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("fail"));

      const { result } = renderHook(() => useSettings());
      await waitFor(() => expect(result.current.error).toBe("fail"));

      mockInvoke.mockResolvedValueOnce(makeSettings());
      await act(async () => {
        await result.current.refresh();
      });

      expect(result.current.error).toBeNull();
      expect(result.current.settings).toBeTruthy();
    });
  });
});
