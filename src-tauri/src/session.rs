use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tokio::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum CliType {
    ClaudeCode,
    Codex,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum SessionStatus {
    Idle,
    Running,
    Terminated,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionState {
    pub session_id: Option<String>,
    pub cwd: PathBuf,
    pub cli_type: CliType,
    pub status: SessionStatus,
}

pub struct SessionManager {
    pub state: Mutex<Option<SessionState>>,
    pub child: Mutex<Option<tokio::process::Child>>,
}

impl SessionManager {
    pub fn new() -> Self {
        Self {
            state: Mutex::new(None),
            child: Mutex::new(None),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_manager_starts_with_no_state() {
        let manager = SessionManager::new();
        let state = manager.state.blocking_lock();
        assert!(state.is_none());
    }

    #[test]
    fn session_manager_starts_with_no_child() {
        let manager = SessionManager::new();
        let child = manager.child.blocking_lock();
        assert!(child.is_none());
    }

    #[test]
    fn session_state_serializes_correctly() {
        let state = SessionState {
            session_id: Some("test-123".to_string()),
            cwd: PathBuf::from("/tmp/test"),
            cli_type: CliType::ClaudeCode,
            status: SessionStatus::Idle,
        };
        let json = serde_json::to_value(&state).unwrap();
        assert_eq!(json["sessionId"], "test-123");
        assert_eq!(json["cliType"], "claude-code");
        assert_eq!(json["status"], "idle");
    }

    #[test]
    fn cli_type_deserializes_from_kebab_case() {
        let claude: CliType = serde_json::from_str("\"claude-code\"").unwrap();
        assert_eq!(claude, CliType::ClaudeCode);
        let codex: CliType = serde_json::from_str("\"codex\"").unwrap();
        assert_eq!(codex, CliType::Codex);
    }
}
