import { useEffect, useCallback, useMemo, useRef, useState } from "react";
import "./App.css";
import { Sidebar } from "./components/Sidebar";
import { SessionView } from "./components/SessionView";
import { SessionTabBar } from "./components/SessionTabBar";
import { ProjectsView } from "./components/ProjectsView";
import { HistoryView } from "./components/HistoryView";
import { FlowsView } from "./components/FlowsView";
import { FlowEditorView } from "./components/FlowEditorView";
import { SettingsView } from "./components/SettingsView";
import { StatusBar } from "./components/StatusBar";
import { useSessionManager } from "./hooks/useSessionManager";
import { useSettings } from "./hooks/useSettings";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import type { PageId, CliType, Flow, Settings } from "./types";
import { useFlows } from "./hooks/useFlows";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

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

  const { executeFlow, approveStep, rejectStep } = useFlows();
  const { settings, updateSettings } = useSettings();

  const abortRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback(async (title: string, body: string) => {
    try {
      let granted = await isPermissionGranted();
      if (!granted) {
        const permission = await requestPermission();
        granted = permission === "granted";
      }
      if (granted) {
        sendNotification({ title, body });
      }
    } catch {
      // Notification delivery is best-effort; log for diagnostics only
      void 0;
    }
  }, []);

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
      const hasControlFlow = flow.steps.some(
        (s) => s.stepType !== "prompt",
      );

      if (hasControlFlow) {
        let resolvedExecutionId: string | null = null;

        const executionPromise = executeFlow(flow.id, cwd, cliType, null, (event) => {
          if (event.event === "approvalRequired" && resolvedExecutionId) {
            if (settings?.notifyOnApproval) {
              void notify("Approval Required", `Step "${String(event.data.stepName)}" requires approval.`);
            }
            const approved = window.confirm(
              `Step "${String(event.data.stepName)}" requires approval. Approve?`,
            );
            void (approved
              ? approveStep(resolvedExecutionId)
              : rejectStep(resolvedExecutionId));
          } else if (event.event === "flowFailed") {
            if (settings?.notifyOnError) {
              void notify("Flow Failed", String(event.data.error));
            }
            window.alert(`Flow failed: ${String(event.data.error)}`);
          } else if (event.event === "flowCompleted") {
            if (settings?.notifyOnCompletion) {
              void notify("Flow Completed", `Flow "${flow.name}" completed successfully.`);
            }
            window.alert("Flow completed successfully.");
          }
        });

        void executionPromise.then((execId) => {
          resolvedExecutionId = execId;
        });
      } else {
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
      }
    },
    [startSession, addItems, toggleAutoRun, executeFlow, approveStep, rejectStep, settings, notify],
  );

  // Notify when manual mode confirmation is required
  useEffect(() => {
    if (!queueState?.confirmingItemId) return;
    if (!settings?.notifyOnApproval) return;
    const item = queueState.items.find((i) => i.id === queueState.confirmingItemId);
    if (item) {
      void notify("Approval Required", `Queue item "${item.prompt.slice(0, 50)}" needs confirmation.`);
    }
  }, [queueState?.confirmingItemId, queueState?.items, settings?.notifyOnApproval, notify]);

  // Keyboard shortcuts
  const handleSaveSettings = useCallback(
    (newSettings: Settings) => {
      updateSettings(newSettings).catch((e: unknown) => {
        const message = e instanceof Error ? e.message : String(e);
        window.alert(`Failed to save settings: ${message}`);
      });
    },
    [updateSettings],
  );

  const shortcutActions = useMemo(
    () => ({
      sendPrompt: () => {
        // No-op: PromptInput's own onKeyDown fires before this
        // document-level handler. This entry exists so that
        // useKeyboardShortcuts allows the shortcut in input contexts
        // (see isInputFocused guard) and calls preventDefault().
      },
      abort: () => {
        if (activeId) {
          abortRef.current = true;
          void abortPrompt(activeId);
        }
      },
      newSession: () => {
        setShowSetup(true);
        setActivePage("sessions");
      },
      closeSession: () => {
        if (activeId) {
          void closeSession(activeId);
        }
      },
      toggleAutoRun: () => {
        if (activeId) {
          toggleAutoRun(activeId);
        }
      },
      pauseResume: () => {
        if (activeId && queueState) {
          if (queueState.paused) {
            resumeQueue(activeId);
          } else {
            pauseQueue(activeId);
          }
        }
      },
    }),
    [activeId, abortPrompt, closeSession, toggleAutoRun, queueState, pauseQueue, resumeQueue],
  );

  useKeyboardShortcuts(settings?.keyboardShortcuts ?? null, shortcutActions);

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
          {activePage === "settings" && (
            <SettingsView
              key={JSON.stringify(settings)}
              settings={settings}
              onSave={handleSaveSettings}
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
