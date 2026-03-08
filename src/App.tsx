import "./App.css";
import { Sidebar } from "./components/Sidebar";
import { SessionView } from "./components/SessionView";
import { StatusBar } from "./components/StatusBar";
import { useSession } from "./hooks/useSession";

function App() {
  const { state, startSession, sendPrompt, stopSession } = useSession();

  return (
    <div className="app">
      <div className="main-layout">
        <Sidebar />
        <div className="content">
          <SessionView
            state={state}
            onStartSession={startSession}
            onSendPrompt={sendPrompt}
            onStopSession={stopSession}
          />
        </div>
      </div>
      <StatusBar status={state.status} cliType={state.cliType} />
    </div>
  );
}

export default App;
