import { useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";
import { Sidebar } from "./components/Sidebar";
import { SessionView } from "./components/SessionView";
import { StatusBar } from "./components/StatusBar";
import { useSession } from "./hooks/useSession";
import { useQueue } from "./hooks/useQueue";

function App() {
  const { state, startSession, sendPrompt, stopSession } = useSession();
  const {
    state: queueState,
    addItem,
    addItems,
    removeItem,
    editItem,
    reorder,
    setItemStatus,
    toggleAutoRun,
    clearCompleted,
    pause,
    resume,
    skipItem,
    retryItem,
    setItemTimeout,
    confirmItem,
    clearConfirming,
  } = useQueue();

  const abortRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleManualSend = useCallback(
    (prompt: string) => {
      void sendPrompt(prompt);
    },
    [sendPrompt],
  );

  const executeItem = useCallback(
    (itemId: string, prompt: string, timeoutMs: number | null) => {
      setItemStatus(itemId, "running");

      if (timeoutMs) {
        timeoutRef.current = setTimeout(() => {
          abortRef.current = true;
          void invoke("abort_prompt");
        }, timeoutMs);
      }

      void sendPrompt(prompt, (code) => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }

        const resultStatus = abortRef.current ? "failed" : code === 0 ? "completed" : "failed";
        abortRef.current = false;
        setItemStatus(itemId, resultStatus);
      });
    },
    [sendPrompt, setItemStatus],
  );

  const handleAbort = useCallback(() => {
    abortRef.current = true;
    void invoke("abort_prompt");
  }, []);

  const handleRetry = useCallback(
    (id: string) => {
      retryItem(id);
    },
    [retryItem],
  );

  const handleConfirmExecute = useCallback(
    (id: string) => {
      const item = queueState.items.find((i) => i.id === id);
      if (!item) return;
      clearConfirming();
      executeItem(item.id, item.prompt, item.timeoutMs);
    },
    [queueState.items, clearConfirming, executeItem],
  );

  const handleConfirmSkip = useCallback(
    (id: string) => {
      skipItem(id);
      clearConfirming();
    },
    [skipItem, clearConfirming],
  );

  useEffect(() => {
    if (queueState.paused) return;
    if (state.status !== "idle") return;

    const hasRunning = queueState.items.some((item) => item.status === "running");
    if (hasRunning) return;

    const nextItem = queueState.items.find((item) => item.status === "pending");
    if (!nextItem) return;

    if (queueState.autoRun) {
      executeItem(nextItem.id, nextItem.prompt, nextItem.timeoutMs);
    } else {
      if (queueState.confirmingItemId !== nextItem.id) {
        confirmItem(nextItem.id);
      }
    }
  }, [
    queueState.autoRun,
    queueState.paused,
    queueState.items,
    queueState.confirmingItemId,
    state.status,
    executeItem,
    confirmItem,
  ]);

  return (
    <div className="app">
      <div className="main-layout">
        <Sidebar />
        <div className="content">
          <SessionView
            state={state}
            queueState={queueState}
            onStartSession={startSession}
            onSendPrompt={handleManualSend}
            onStopSession={stopSession}
            onAddItem={addItem}
            onAddItems={addItems}
            onRemoveItem={removeItem}
            onEditItem={editItem}
            onReorder={reorder}
            onToggleAutoRun={toggleAutoRun}
            onClearCompleted={clearCompleted}
            onPause={pause}
            onResume={resume}
            onRetryItem={handleRetry}
            onAbort={handleAbort}
            onSetItemTimeout={setItemTimeout}
            onConfirmExecute={handleConfirmExecute}
            onConfirmSkip={handleConfirmSkip}
          />
        </div>
      </div>
      <StatusBar status={state.status} cliType={state.cliType} />
    </div>
  );
}

export default App;
