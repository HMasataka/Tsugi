use crate::cli_adapter::{CliAdapter, ClaudeCodeAdapter};
use crate::session::{CliType, SessionManager, SessionState, SessionStatus};
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
    state: tauri::State<'_, SessionManager>,
) -> Result<(), String> {
    let cli = match cli_type.as_str() {
        "claude-code" => CliType::ClaudeCode,
        "codex" => CliType::Codex,
        other => return Err(format!("Unknown CLI type: {}", other)),
    };

    let path = PathBuf::from(&cwd);
    if !path.is_dir() {
        return Err(format!("Directory does not exist: {}", cwd));
    }

    let session_state = SessionState {
        session_id: None,
        cwd: path,
        cli_type: cli,
        status: SessionStatus::Idle,
    };

    let mut lock = state.state.lock().await;
    *lock = Some(session_state);

    Ok(())
}

#[tauri::command]
pub async fn send_prompt(
    prompt: String,
    on_event: Channel<SessionEvent>,
    state: tauri::State<'_, SessionManager>,
) -> Result<(), String> {
    let (cwd, session_id, cli_type) = {
        let mut lock = state.state.lock().await;
        let session = lock.as_mut().ok_or("No active session")?;
        if session.status == SessionStatus::Running {
            return Err("Session is already running".to_string());
        }
        session.status = SessionStatus::Running;
        (
            session.cwd.clone(),
            session.session_id.clone(),
            session.cli_type.clone(),
        )
    };

    let adapter: Box<dyn CliAdapter> = match cli_type {
        CliType::ClaudeCode => Box::new(ClaudeCodeAdapter),
        CliType::Codex => {
            let mut lock = state.state.lock().await;
            if let Some(session) = lock.as_mut() {
                session.status = SessionStatus::Idle;
            }
            return Err("Codex adapter is not implemented".to_string());
        }
    };

    let mut cmd = adapter.build_command(&prompt, &cwd, session_id.as_deref());
    let mut child = match cmd.spawn() {
        Ok(child) => child,
        Err(e) => {
            let mut lock = state.state.lock().await;
            if let Some(session) = lock.as_mut() {
                session.status = SessionStatus::Idle;
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
        let mut child_lock = state.child.lock().await;
        *child_lock = Some(child);
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

    let mut reader = BufReader::new(stdout).lines();

    while let Ok(Some(line)) = reader.next_line().await {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&line) {
            if let Some(sid) = extract_session_id(&json) {
                let mut lock = state.state.lock().await;
                if let Some(session) = lock.as_mut() {
                    session.session_id = Some(sid.clone());
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
        let mut child_lock = state.child.lock().await;
        if let Some(ref mut child) = *child_lock {
            child.wait().await.ok().and_then(|s| s.code())
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
        let mut lock = state.state.lock().await;
        if let Some(session) = lock.as_mut() {
            session.status = SessionStatus::Idle;
        }
    }

    {
        let mut child_lock = state.child.lock().await;
        *child_lock = None;
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
    state: tauri::State<'_, SessionManager>,
) -> Result<(), String> {
    let mut child_lock = state.child.lock().await;
    if let Some(ref mut child) = *child_lock {
        let _ = child.kill().await;
    }
    *child_lock = None;

    let mut lock = state.state.lock().await;
    if let Some(session) = lock.as_mut() {
        session.status = SessionStatus::Idle;
    }
    Ok(())
}

#[tauri::command]
pub async fn stop_session(
    state: tauri::State<'_, SessionManager>,
) -> Result<(), String> {
    {
        let mut child_lock = state.child.lock().await;
        if let Some(ref mut child) = *child_lock {
            let _ = child.kill().await;
        }
        *child_lock = None;
    }

    {
        let mut lock = state.state.lock().await;
        if let Some(session) = lock.as_mut() {
            session.status = SessionStatus::Terminated;
        }
    }

    Ok(())
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
