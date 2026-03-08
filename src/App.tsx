import { useEffect, useCallback } from "react";
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
  } = useQueue();

  const handleManualSend = useCallback(
    (prompt: string) => {
      void sendPrompt(prompt);
    },
    [sendPrompt],
  );

  useEffect(() => {
    if (!queueState.autoRun) return;
    if (state.status !== "idle") return;

    const hasRunning = queueState.items.some((item) => item.status === "running");
    if (hasRunning) return;

    const nextItem = queueState.items.find((item) => item.status === "pending");
    if (!nextItem) return;

    setItemStatus(nextItem.id, "running");
    void sendPrompt(nextItem.prompt, (code) => {
      const resultStatus = code === 0 ? "completed" : "failed";
      setItemStatus(nextItem.id, resultStatus);
    });
  }, [
    queueState.autoRun,
    queueState.items,
    state.status,
    sendPrompt,
    setItemStatus,
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
          />
        </div>
      </div>
      <StatusBar status={state.status} cliType={state.cliType} />
    </div>
  );
}

export default App;
