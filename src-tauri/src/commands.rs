use crate::cli_adapter::{CliAdapter, ClaudeCodeAdapter};
use crate::project::{Project, ProjectStore, RecentDirectory};
use crate::session::{CliType, SessionEntry, SessionInfo, SessionManager, SessionState, SessionStatus};
use serde::Serialize;
use std::path::PathBuf;
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

    let session_state = SessionState {
        session_id: resume_session_id,
        cwd: path,
        cli_type: cli,
        status: SessionStatus::Idle,
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
) -> Result<(), String> {
    let (cwd, resume_id, cli_type) = {
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
        )
    };

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

    let stdout = child
        .stdout
        .take()
        .ok_or("Failed to capture stdout")?;

    let stderr = child
        .stderr
        .take()
        .ok_or("Failed to capture stderr")?;

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
        }
        if on_event
            .send(SessionEvent::Output { raw: line })
            .is_err()
        {
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
    if json.get("type")?.as_str()? == "system"
        && json.get("subtype")?.as_str()? == "init"
    {
        return json.get("session_id")?.as_str().map(|s| s.to_string());
    }
    None
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
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().await;
    let entry = sessions
        .remove(&session_id)
        .ok_or_else(|| format!("Session not found: {}", session_id))?;

    if let Some(mut child) = entry.child {
        let _ = child.kill().await;
    }

    Ok(())
}

#[tauri::command]
pub async fn stop_all_sessions(
    state: tauri::State<'_, SessionManager>,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().await;
    for entry in sessions.values_mut() {
        if let Some(ref mut child) = entry.child {
            let _ = child.kill().await;
        }
        entry.child = None;
        entry.state.status = SessionStatus::Terminated;
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
            let pid = entry
                .child
                .as_ref()
                .and_then(|c| c.id());
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
pub async fn list_projects(
    store: tauri::State<'_, ProjectStore>,
) -> Result<Vec<Project>, String> {
    store.list_projects()
}

#[tauri::command]
pub async fn list_recent_dirs(
    store: tauri::State<'_, ProjectStore>,
) -> Result<Vec<RecentDirectory>, String> {
    store.list_recent_dirs()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_session_id_from_init_event() {
        let json: serde_json::Value = serde_json::from_str(
            r#"{"type":"system","subtype":"init","session_id":"abc-123"}"#,
        )
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
