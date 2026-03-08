import { useEffect, useCallback, useRef, useState } from "react";
import "./App.css";
import { Sidebar } from "./components/Sidebar";
import { SessionView } from "./components/SessionView";
import { SessionTabBar } from "./components/SessionTabBar";
import { ProjectsView } from "./components/ProjectsView";
import { HistoryView } from "./components/HistoryView";
import { FlowsView } from "./components/FlowsView";
import { FlowEditorView } from "./components/FlowEditorView";
import { StatusBar } from "./components/StatusBar";
import { useSessionManager } from "./hooks/useSessionManager";
import type { PageId, CliType, Flow } from "./types";

function App() {
  const [activePage, setActivePage] = useState<PageId>("sessions");
  const [showSetup, setShowSetup] = useState(false);
  const [editingFlowId, setEditingFlowId] = useState<string | null>(null);

  const {
    state: managerState,
    activeSession,
    startSession,
    sendPrompt,
    stopSession,
    closeSession,
    setActiveSession,
    abortPrompt,
    addItem,
    addItems,
    removeItem,
    editItem,
    reorder,
    setItemStatus,
    toggleAutoRun,
    clearCompleted,
    pauseQueue,
    resumeQueue,
    skipItem,
    retryItem,
    setItemTimeout,
    confirmItem,
    clearConfirming,
  } = useSessionManager();

  const abortRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeId = managerState.activeSessionId;
  const sessionState = activeSession?.state ?? null;
  const queueState = activeSession?.queueState ?? null;

  const handleStartSession = useCallback(
    async (cwd: string, cliType: CliType, resumeSessionId?: string) => {
      await startSession(cwd, cliType, resumeSessionId);
      setShowSetup(false);
    },
    [startSession],
  );

  const handleManualSend = useCallback(
    (prompt: string) => {
      if (!activeId) return;
      void sendPrompt(activeId, prompt);
    },
    [activeId, sendPrompt],
  );

  const executeItem = useCallback(
    (itemId: string, prompt: string, timeoutMs: number | null) => {
      if (!activeId) return;
      setItemStatus(activeId, itemId, "running");

      if (timeoutMs) {
        timeoutRef.current = setTimeout(() => {
          abortRef.current = true;
          void abortPrompt(activeId);
        }, timeoutMs);
      }

      void sendPrompt(activeId, prompt, (code) => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }

        const resultStatus = abortRef.current ? "failed" : code === 0 ? "completed" : "failed";
        abortRef.current = false;
        if (activeId) {
          setItemStatus(activeId, itemId, resultStatus);
        }
      });
    },
    [activeId, sendPrompt, setItemStatus, abortPrompt],
  );

  const handleAbort = useCallback(() => {
    if (!activeId) return;
    abortRef.current = true;
    void abortPrompt(activeId);
  }, [activeId, abortPrompt]);

  const handleStopSession = useCallback(async () => {
    if (!activeId) return;
    await stopSession(activeId);
  }, [activeId, stopSession]);

  const handleRetry = useCallback(
    (id: string) => {
      if (!activeId) return;
      retryItem(activeId, id);
    },
    [activeId, retryItem],
  );

  const handleConfirmExecute = useCallback(
    (id: string) => {
      if (!activeId || !queueState) return;
      const item = queueState.items.find((i) => i.id === id);
      if (!item) return;
      clearConfirming(activeId);
      executeItem(item.id, item.prompt, item.timeoutMs);
    },
    [activeId, queueState, clearConfirming, executeItem],
  );

  const handleConfirmSkip = useCallback(
    (id: string) => {
      if (!activeId) return;
      skipItem(activeId, id);
      clearConfirming(activeId);
    },
    [activeId, skipItem, clearConfirming],
  );

  const handleNewSession = useCallback(() => {
    setShowSetup(true);
    setActivePage("sessions");
  }, []);

  const handleCloseSession = useCallback(
    (sessionId: string) => {
      void closeSession(sessionId);
    },
    [closeSession],
  );

  const handleOpenProjectSession = useCallback(
    (cwd: string, cliType: CliType) => {
      setActivePage("sessions");
      void startSession(cwd, cliType);
    },
    [startSession],
  );

  const handleEditFlow = useCallback((flowId: string) => {
    setEditingFlowId(flowId);
  }, []);

  const handleBackToFlows = useCallback(() => {
    setEditingFlowId(null);
  }, []);

  const handleRunFlow = useCallback(
    (flow: Flow, cwd: string, cliType: CliType) => {
      setActivePage("sessions");
      void startSession(cwd, cliType).then((sessionId) => {
        if (sessionId) {
          const items = flow.steps.map((step) => ({
            prompt: step.prompt,
            timeoutMs: step.timeoutSecs != null ? step.timeoutSecs * 1000 : null,
          }));
          addItems(sessionId, items);
          toggleAutoRun(sessionId);
        }
      });
    },
    [startSession, addItems, toggleAutoRun],
  );

  // Auto-execute queue items for the active session
  useEffect(() => {
    if (!activeId || !queueState || !sessionState) return;
    if (queueState.paused) return;
    if (sessionState.status !== "idle") return;

    const hasRunning = queueState.items.some((item) => item.status === "running");
    if (hasRunning) return;

    const nextItem = queueState.items.find((item) => item.status === "pending");
    if (!nextItem) return;

    if (queueState.autoRun) {
      executeItem(nextItem.id, nextItem.prompt, nextItem.timeoutMs);
    } else {
      if (queueState.confirmingItemId !== nextItem.id) {
        confirmItem(activeId, nextItem.id);
      }
    }
  }, [
    activeId,
    queueState,
    sessionState,
    executeItem,
    confirmItem,
  ]);

  const shouldShowSetup =
    showSetup || (activePage === "sessions" && managerState.sessions.length === 0);

  return (
    <div className="app">
      <div className="main-layout">
        <Sidebar
          activePage={activePage}
          onNavigate={setActivePage}
          sessionCount={managerState.sessions.length}
        />
        <div className="content">
          {activePage === "sessions" && (
            <>
              {managerState.sessions.length > 0 && (
                <SessionTabBar
                  sessions={managerState.sessions}
                  activeSessionId={managerState.activeSessionId}
                  onSelectSession={(id) => {
                    setActiveSession(id);
                    setShowSetup(false);
                  }}
                  onCloseSession={handleCloseSession}
                  onNewSession={handleNewSession}
                />
              )}
              {shouldShowSetup || !activeSession ? (
                <SessionView
                  state={null}
                  queueState={null}
                  onStartSession={handleStartSession}
                  onSendPrompt={handleManualSend}
                  onStopSession={handleStopSession}
                  onAddItem={(prompt) => activeId && addItem(activeId, prompt)}
                  onAddItems={(prompts) => activeId && addItems(activeId, prompts.map((p) => ({ prompt: p, timeoutMs: null })))}
                  onRemoveItem={(id) => activeId && removeItem(activeId, id)}
                  onEditItem={(id, prompt) => activeId && editItem(activeId, id, prompt)}
                  onReorder={(from, to) => activeId && reorder(activeId, from, to)}
                  onToggleAutoRun={() => activeId && toggleAutoRun(activeId)}
                  onClearCompleted={() => activeId && clearCompleted(activeId)}
                  onPause={() => activeId && pauseQueue(activeId)}
                  onResume={() => activeId && resumeQueue(activeId)}
                  onRetryItem={handleRetry}
                  onAbort={handleAbort}
                  onSetItemTimeout={(id, ms) => activeId && setItemTimeout(activeId, id, ms)}
                  onConfirmExecute={handleConfirmExecute}
                  onConfirmSkip={handleConfirmSkip}
                />
              ) : (
                <SessionView
                  state={activeSession.state}
                  queueState={activeSession.queueState}
                  onStartSession={handleStartSession}
                  onSendPrompt={handleManualSend}
                  onStopSession={handleStopSession}
                  onAddItem={(prompt) => addItem(activeId!, prompt)}
                  onAddItems={(prompts) => addItems(activeId!, prompts.map((p) => ({ prompt: p, timeoutMs: null })))}
                  onRemoveItem={(id) => removeItem(activeId!, id)}
                  onEditItem={(id, prompt) => editItem(activeId!, id, prompt)}
                  onReorder={(from, to) => reorder(activeId!, from, to)}
                  onToggleAutoRun={() => toggleAutoRun(activeId!)}
                  onClearCompleted={() => clearCompleted(activeId!)}
                  onPause={() => pauseQueue(activeId!)}
                  onResume={() => resumeQueue(activeId!)}
                  onRetryItem={handleRetry}
                  onAbort={handleAbort}
                  onSetItemTimeout={(id, ms) => setItemTimeout(activeId!, id, ms)}
                  onConfirmExecute={handleConfirmExecute}
                  onConfirmSkip={handleConfirmSkip}
                />
              )}
            </>
          )}
          {activePage === "projects" && (
            <ProjectsView onOpenSession={handleOpenProjectSession} />
          )}
          {activePage === "flows" && (
            editingFlowId ? (
              <FlowEditorView
                flowId={editingFlowId}
                onBack={handleBackToFlows}
                onRunFlow={handleRunFlow}
              />
            ) : (
              <FlowsView
                onEditFlow={handleEditFlow}
                onRunFlow={handleRunFlow}
              />
            )
          )}
          {activePage === "history" && (
            <HistoryView
              onRerun={(cwd, cliType, prompts) => {
                setActivePage("sessions");
                void startSession(cwd, cliType).then((sessionId) => {
                  if (sessionId) {
                    addItems(sessionId, prompts.map((p) => ({ prompt: p, timeoutMs: null })));
                  }
                });
              }}
            />
          )}
        </div>
      </div>
      <StatusBar
        status={sessionState?.status ?? null}
        cliType={sessionState?.cliType ?? null}
        sessionCount={managerState.sessions.length}
        tokenUsage={sessionState?.tokenUsage ?? null}
      />
    </div>
  );
}

export default App;
