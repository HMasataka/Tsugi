use crate::cli_adapter::{ClaudeCodeAdapter, CliAdapter};
use crate::db::Database;
use crate::flow::{Flow, FlowStep, FlowStore};
use crate::flow_runner::{FlowExecution, FlowExecutionEvent, FlowExecutionManager, FlowRunner};
use crate::history::{
    self, Execution, ExecutionDetail, ExecutionStep, ExecutionSummary, HistoryFilter, StepOutput,
};
use crate::project::{Project, ProjectStore, RecentDirectory};
use crate::session::{
    CliType, SessionEntry, SessionInfo, SessionManager, SessionState, SessionStatus,
};
use crate::settings::{Settings, SettingsStore};
use crate::util;
use crate::worktree;
use serde::Serialize;
use std::path::PathBuf;
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::Arc;
use tauri::ipc::Channel;
use tokio::io::{AsyncBufReadExt, BufReader};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "event", content = "data")]
pub enum SessionEvent {
    Output { raw: String },
    SessionStarted { session_id: String },
    ProcessExited { code: Option<i32> },
    Error { message: String },
}

#[tauri::command]
pub async fn start_session(
    cwd: String,
    cli_type: String,
    resume_session_id: Option<String>,
    state: tauri::State<'_, SessionManager>,
    project_store: tauri::State<'_, ProjectStore>,
    db: tauri::State<'_, Database>,
) -> Result<String, String> {
    let cli = match cli_type.as_str() {
        "claude-code" => CliType::ClaudeCode,
        "codex" => CliType::Codex,
        other => return Err(format!("Unknown CLI type: {}", other)),
    };

    let path = PathBuf::from(&cwd);
    if !path.is_dir() {
        return Err(format!("Directory does not exist: {}", cwd));
    }

    let id = state.generate_id().await;

    // Persist execution record
    let execution_id = util::generate_id();
    let execution = Execution {
        id: execution_id.clone(),
        cwd: cwd.clone(),
        cli_type: cli_type.clone(),
        status: "running".to_string(),
        started_at: util::now_millis(),
        finished_at: None,
        total_input_tokens: 0,
        total_output_tokens: 0,
    };
    if let Err(e) = history::create_execution(&db, &execution) {
        log::warn!("Failed to create execution record: {}", e);
    }

    let session_state = SessionState {
        session_id: resume_session_id,
        cwd: path,
        cli_type: cli,
        status: SessionStatus::Idle,
        execution_id: Some(execution_id),
    };

    let entry = SessionEntry {
        state: session_state,
        child: None,
        started_at: std::time::Instant::now(),
    };

    let mut sessions = state.sessions.lock().await;
    sessions.insert(id.clone(), entry);

    // Record as recently used directory
    if let Err(e) = project_store.record_recent_dir(&cwd) {
        log::warn!("Failed to record recent directory: {}", e);
    }

    Ok(id)
}

#[tauri::command]
pub async fn send_prompt(
    session_id: String,
    prompt: String,
    on_event: Channel<SessionEvent>,
    state: tauri::State<'_, SessionManager>,
    db: tauri::State<'_, Database>,
) -> Result<(), String> {
    let (cwd, resume_id, cli_type, execution_id) = {
        let mut sessions = state.sessions.lock().await;
        let entry = sessions
            .get_mut(&session_id)
            .ok_or_else(|| format!("Session not found: {}", session_id))?;
        if entry.state.status == SessionStatus::Running {
            return Err("Session is already running".to_string());
        }
        entry.state.status = SessionStatus::Running;
        (
            entry.state.cwd.clone(),
            entry.state.session_id.clone(),
            entry.state.cli_type.clone(),
            entry.state.execution_id.clone(),
        )
    };

    // Persist step record
    let step_id = util::generate_id();
    if let Some(ref exec_id) = execution_id {
        let step_order = history::get_step_count(&db, exec_id).unwrap_or(0);
        let step = ExecutionStep {
            id: step_id.clone(),
            execution_id: exec_id.clone(),
            step_order,
            prompt: prompt.clone(),
            status: "running".to_string(),
            started_at: util::now_millis(),
            finished_at: None,
            exit_code: None,
            input_tokens: 0,
            output_tokens: 0,
        };
        if let Err(e) = history::create_step(&db, &step) {
            log::warn!("Failed to create step record: {}", e);
        }
    }

    let adapter: Box<dyn CliAdapter> = match cli_type {
        CliType::ClaudeCode => Box::new(ClaudeCodeAdapter),
        CliType::Codex => {
            let mut sessions = state.sessions.lock().await;
            if let Some(entry) = sessions.get_mut(&session_id) {
                entry.state.status = SessionStatus::Idle;
            }
            return Err("Codex adapter is not implemented".to_string());
        }
    };

    let mut cmd = adapter.build_command(&prompt, &cwd, resume_id.as_deref());
    let mut child = match cmd.spawn() {
        Ok(child) => child,
        Err(e) => {
            let mut sessions = state.sessions.lock().await;
            if let Some(entry) = sessions.get_mut(&session_id) {
                entry.state.status = SessionStatus::Idle;
            }
            return Err(format!("Failed to spawn process: {}", e));
        }
    };

    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;

    let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;

    {
        let mut sessions = state.sessions.lock().await;
        if let Some(entry) = sessions.get_mut(&session_id) {
            entry.child = Some(child);
        }
    }

    let stderr_event = on_event.clone();
    tokio::spawn(async move {
        let mut err_reader = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = err_reader.next_line().await {
            if stderr_event
                .send(SessionEvent::Error { message: line })
                .is_err()
            {
                break;
            }
        }
    });

    let session_id_for_update = session_id.clone();
    let mut reader = BufReader::new(stdout).lines();
    let output_seq = AtomicI64::new(0);
    let mut input_tokens: i64 = 0;
    let mut output_tokens: i64 = 0;

    while let Ok(Some(line)) = reader.next_line().await {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&line) {
            if let Some(sid) = extract_session_id(&json) {
                let mut sessions = state.sessions.lock().await;
                if let Some(entry) = sessions.get_mut(&session_id_for_update) {
                    entry.state.session_id = Some(sid.clone());
                }
                if on_event
                    .send(SessionEvent::SessionStarted { session_id: sid })
                    .is_err()
                {
                    break;
                }
            }

            let (inp, out) = extract_token_usage(&json);
            input_tokens += inp;
            output_tokens += out;
        }

        // Persist output line
        if execution_id.is_some() {
            let seq = output_seq.fetch_add(1, Ordering::Relaxed);
            if let Err(e) = history::append_output(&db, &step_id, seq, &line) {
                log::warn!("Failed to append output: {}", e);
            }
        }

        if on_event.send(SessionEvent::Output { raw: line }).is_err() {
            break;
        }
    }

    let exit_code = {
        let mut sessions = state.sessions.lock().await;
        if let Some(entry) = sessions.get_mut(&session_id_for_update) {
            if let Some(ref mut child) = entry.child {
                child.wait().await.ok().and_then(|s| s.code())
            } else {
                None
            }
        } else {
            None
        }
    };

    // Finish the step in DB
    if execution_id.is_some() {
        let step_status = match exit_code {
            Some(0) => "completed",
            _ => "failed",
        };
        if let Err(e) = history::finish_step(
            &db,
            &step_id,
            step_status,
            exit_code,
            input_tokens,
            output_tokens,
        ) {
            log::warn!("Failed to finish step record: {}", e);
        }
    }

    if on_event
        .send(SessionEvent::ProcessExited { code: exit_code })
        .is_err()
    {
        log::warn!("Failed to send ProcessExited event: channel closed");
    }

    {
        let mut sessions = state.sessions.lock().await;
        if let Some(entry) = sessions.get_mut(&session_id_for_update) {
            entry.state.status = SessionStatus::Idle;
            entry.child = None;
        }
    }

    Ok(())
}

fn extract_session_id(json: &serde_json::Value) -> Option<String> {
    if json.get("type")?.as_str()? == "system" && json.get("subtype")?.as_str()? == "init" {
        return json.get("session_id")?.as_str().map(|s| s.to_string());
    }
    None
}

fn extract_token_usage(json: &serde_json::Value) -> (i64, i64) {
    if let Some(usage) = json.get("usage") {
        let input = usage
            .get("input_tokens")
            .and_then(|v| v.as_i64())
            .unwrap_or(0);
        let output = usage
            .get("output_tokens")
            .and_then(|v| v.as_i64())
            .unwrap_or(0);
        return (input, output);
    }
    (0, 0)
}

#[tauri::command]
pub async fn abort_prompt(
    session_id: String,
    state: tauri::State<'_, SessionManager>,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().await;
    let entry = sessions
        .get_mut(&session_id)
        .ok_or_else(|| format!("Session not found: {}", session_id))?;

    if let Some(ref mut child) = entry.child {
        let _ = child.kill().await;
    }
    entry.child = None;
    entry.state.status = SessionStatus::Idle;

    Ok(())
}

#[tauri::command]
pub async fn stop_session(
    session_id: String,
    state: tauri::State<'_, SessionManager>,
    db: tauri::State<'_, Database>,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().await;
    let entry = sessions
        .remove(&session_id)
        .ok_or_else(|| format!("Session not found: {}", session_id))?;

    // Finish the execution in DB
    if let Some(ref exec_id) = entry.state.execution_id {
        if let Err(e) = history::finish_execution(&db, exec_id, "completed") {
            log::warn!("Failed to finish execution record: {}", e);
        }
    }

    if let Some(mut child) = entry.child {
        let _ = child.kill().await;
    }

    Ok(())
}

#[tauri::command]
pub async fn stop_all_sessions(
    state: tauri::State<'_, SessionManager>,
    db: tauri::State<'_, Database>,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().await;
    for (_id, entry) in sessions.drain() {
        if let Some(mut child) = entry.child {
            let _ = child.kill().await;
        }

        if let Some(ref exec_id) = entry.state.execution_id {
            if let Err(e) = history::finish_execution(&db, exec_id, "completed") {
                log::warn!("Failed to finish execution record: {}", e);
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn list_sessions(
    state: tauri::State<'_, SessionManager>,
) -> Result<Vec<SessionInfo>, String> {
    let sessions = state.sessions.lock().await;
    let now = std::time::Instant::now();

    let infos: Vec<SessionInfo> = sessions
        .iter()
        .map(|(id, entry)| {
            let pid = entry.child.as_ref().and_then(|c| c.id());
            SessionInfo {
                id: id.clone(),
                pid,
                cwd: entry.state.cwd.to_string_lossy().to_string(),
                cli_type: entry.state.cli_type.clone(),
                status: entry.state.status.clone(),
                elapsed_secs: now.duration_since(entry.started_at).as_secs(),
            }
        })
        .collect();

    Ok(infos)
}

#[tauri::command]
pub async fn register_project(
    name: String,
    path: String,
    cli_type: String,
    store: tauri::State<'_, ProjectStore>,
) -> Result<Project, String> {
    let cli = match cli_type.as_str() {
        "claude-code" => CliType::ClaudeCode,
        "codex" => CliType::Codex,
        other => return Err(format!("Unknown CLI type: {}", other)),
    };
    store.register(name, path, cli)
}

#[tauri::command]
pub async fn unregister_project(
    project_id: String,
    store: tauri::State<'_, ProjectStore>,
) -> Result<(), String> {
    store.unregister(&project_id)
}

#[tauri::command]
pub async fn list_projects(store: tauri::State<'_, ProjectStore>) -> Result<Vec<Project>, String> {
    store.list_projects()
}

#[tauri::command]
pub async fn list_recent_dirs(
    store: tauri::State<'_, ProjectStore>,
) -> Result<Vec<RecentDirectory>, String> {
    store.list_recent_dirs()
}

// History commands

#[tauri::command]
pub async fn list_executions(
    filter: HistoryFilter,
    db: tauri::State<'_, Database>,
) -> Result<Vec<ExecutionSummary>, String> {
    history::list_executions(&db, &filter)
}

#[tauri::command]
pub async fn get_execution_detail(
    execution_id: String,
    db: tauri::State<'_, Database>,
) -> Result<ExecutionDetail, String> {
    history::get_execution_detail(&db, &execution_id)
}

#[tauri::command]
pub async fn get_step_outputs(
    step_id: String,
    db: tauri::State<'_, Database>,
) -> Result<Vec<StepOutput>, String> {
    history::get_step_outputs(&db, &step_id)
}

#[tauri::command]
pub async fn export_execution(
    execution_id: String,
    db: tauri::State<'_, Database>,
) -> Result<String, String> {
    history::export_execution(&db, &execution_id)
}

#[tauri::command]
pub async fn delete_execution(
    execution_id: String,
    db: tauri::State<'_, Database>,
) -> Result<(), String> {
    history::delete_execution(&db, &execution_id)
}

#[tauri::command]
pub async fn write_export_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, &content).map_err(|e| format!("Failed to write export file: {}", e))
}

// Flow commands

#[tauri::command]
pub async fn list_flows(store: tauri::State<'_, FlowStore>) -> Result<Vec<Flow>, String> {
    store.list()
}

#[tauri::command]
pub async fn get_flow(flow_id: String, store: tauri::State<'_, FlowStore>) -> Result<Flow, String> {
    store.get(&flow_id)
}

#[tauri::command]
pub async fn create_flow(
    name: String,
    description: String,
    steps: Vec<FlowStep>,
    store: tauri::State<'_, FlowStore>,
) -> Result<Flow, String> {
    store.create(name, description, steps)
}

#[tauri::command]
pub async fn update_flow(
    flow_id: String,
    name: String,
    description: String,
    steps: Vec<FlowStep>,
    store: tauri::State<'_, FlowStore>,
) -> Result<Flow, String> {
    store.update(&flow_id, name, description, steps)
}

#[tauri::command]
pub async fn delete_flow(
    flow_id: String,
    store: tauri::State<'_, FlowStore>,
) -> Result<(), String> {
    store.delete(&flow_id)
}

#[tauri::command]
pub async fn import_flow(json: String, store: tauri::State<'_, FlowStore>) -> Result<Flow, String> {
    store.import_flow(&json)
}

#[tauri::command]
pub async fn export_flow(
    flow_id: String,
    store: tauri::State<'_, FlowStore>,
) -> Result<String, String> {
    store.export_flow(&flow_id)
}

// Flow execution commands

#[tauri::command]
pub async fn execute_flow(
    flow_id: String,
    cwd: String,
    cli_type: String,
    session_id: Option<String>,
    on_event: Channel<FlowExecutionEvent>,
    flow_store: tauri::State<'_, FlowStore>,
    settings_store: tauri::State<'_, SettingsStore>,
    execution_manager: tauri::State<'_, Arc<FlowExecutionManager>>,
) -> Result<String, String> {
    let cli = match cli_type.as_str() {
        "claude-code" => CliType::ClaudeCode,
        "codex" => CliType::Codex,
        other => return Err(format!("Unknown CLI type: {}", other)),
    };

    let path = PathBuf::from(&cwd);
    if !path.is_dir() {
        return Err(format!("Directory does not exist: {}", cwd));
    }

    let flow = flow_store.get(&flow_id)?;
    let settings = settings_store.get()?;
    let use_worktree = settings.auto_worktree_for_flows;
    let exec_id = util::generate_id();

    {
        let mut executions = execution_manager.executions.lock().await;
        executions.insert(
            exec_id.clone(),
            FlowExecution {
                approval_sender: None,
            },
        );
    }

    let exec_id_clone = exec_id.clone();
    let manager_clone = Arc::clone(&execution_manager);

    tokio::spawn(async move {
        let worktree_path = if use_worktree {
            match worktree::create_worktree(&path).await {
                Ok(wt_path) => Some(wt_path),
                Err(e) => {
                    log::warn!("Failed to create worktree: {}", e);
                    let _ = on_event.send(FlowExecutionEvent::FlowFailed {
                        error: format!("Worktree creation failed: {}. Flow aborted to prevent unintended changes to the original repository.", e),
                    });
                    let mut executions = manager_clone.executions.lock().await;
                    executions.remove(&exec_id_clone);
                    return;
                }
            }
        } else {
            None
        };

        let effective_cwd = worktree_path.as_deref().unwrap_or(&path);

        let result = FlowRunner::execute_flow(
            &flow.steps,
            effective_cwd,
            &cli,
            session_id.as_deref(),
            &on_event,
            &exec_id_clone,
            &manager_clone,
        )
        .await;

        // Clean up worktree
        if let Some(ref wt_path) = worktree_path {
            if let Err(e) = worktree::remove_worktree(&path, wt_path).await {
                log::warn!("Failed to remove worktree: {}", e);
            }
        }

        // Clean up execution entry
        let mut executions = manager_clone.executions.lock().await;
        executions.remove(&exec_id_clone);

        if let Err(e) = result {
            log::warn!("Flow execution failed: {}", e);
        }
    });

    Ok(exec_id)
}

#[tauri::command]
pub async fn approve_flow_step(
    execution_id: String,
    execution_manager: tauri::State<'_, Arc<FlowExecutionManager>>,
) -> Result<(), String> {
    let mut executions = execution_manager.executions.lock().await;
    let execution = executions
        .get_mut(&execution_id)
        .ok_or_else(|| format!("Execution not found: {}", execution_id))?;

    let sender = execution
        .approval_sender
        .take()
        .ok_or("No pending approval for this execution")?;

    sender
        .send(true)
        .map_err(|_| "Failed to send approval".to_string())
}

#[tauri::command]
pub async fn reject_flow_step(
    execution_id: String,
    execution_manager: tauri::State<'_, Arc<FlowExecutionManager>>,
) -> Result<(), String> {
    let mut executions = execution_manager.executions.lock().await;
    let execution = executions
        .get_mut(&execution_id)
        .ok_or_else(|| format!("Execution not found: {}", execution_id))?;

    let sender = execution
        .approval_sender
        .take()
        .ok_or("No pending approval for this execution")?;

    sender
        .send(false)
        .map_err(|_| "Failed to send rejection".to_string())
}

// Settings commands

#[tauri::command]
pub async fn get_settings(store: tauri::State<'_, SettingsStore>) -> Result<Settings, String> {
    store.get()
}

#[tauri::command]
pub async fn update_settings(
    settings: Settings,
    store: tauri::State<'_, SettingsStore>,
) -> Result<Settings, String> {
    store.update(settings)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_session_id_from_init_event() {
        let json: serde_json::Value =
            serde_json::from_str(r#"{"type":"system","subtype":"init","session_id":"abc-123"}"#)
                .unwrap();
        assert_eq!(extract_session_id(&json), Some("abc-123".to_string()));
    }

    #[test]
    fn extract_session_id_returns_none_for_other_events() {
        let json: serde_json::Value =
            serde_json::from_str(r#"{"type":"assistant","content":"hello"}"#).unwrap();
        assert_eq!(extract_session_id(&json), None);
    }

    #[test]
    fn session_event_serializes_output() {
        let event = SessionEvent::Output {
            raw: "test line".to_string(),
        };
        let json = serde_json::to_value(&event).unwrap();
        assert_eq!(json["event"], "output");
        assert_eq!(json["data"]["raw"], "test line");
    }

    #[test]
    fn session_event_serializes_process_exited() {
        let event = SessionEvent::ProcessExited { code: Some(0) };
        let json = serde_json::to_value(&event).unwrap();
        assert_eq!(json["event"], "processExited");
        assert_eq!(json["data"]["code"], 0);
    }

    #[test]
    fn session_event_serializes_error() {
        let event = SessionEvent::Error {
            message: "something failed".to_string(),
        };
        let json = serde_json::to_value(&event).unwrap();
        assert_eq!(json["event"], "error");
        assert_eq!(json["data"]["message"], "something failed");
    }
}
