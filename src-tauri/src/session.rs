use serde::{Deserialize, Serialize};
use std::collections::HashMap;
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

pub struct SessionEntry {
    pub state: SessionState,
    pub child: Option<tokio::process::Child>,
    pub started_at: std::time::Instant,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub id: String,
    pub pid: Option<u32>,
    pub cwd: String,
    pub cli_type: CliType,
    pub status: SessionStatus,
    pub elapsed_secs: u64,
}

pub struct SessionManager {
    pub sessions: Mutex<HashMap<String, SessionEntry>>,
    pub next_id: Mutex<u32>,
}

impl SessionManager {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            next_id: Mutex::new(1),
        }
    }

    pub async fn generate_id(&self) -> String {
        let mut next = self.next_id.lock().await;
        let id = format!("session-{}", *next);
        *next += 1;
        id
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_manager_starts_with_no_sessions() {
        let manager = SessionManager::new();
        let sessions = manager.sessions.blocking_lock();
        assert!(sessions.is_empty());
    }

    #[test]
    fn session_manager_starts_with_next_id_1() {
        let manager = SessionManager::new();
        let next_id = manager.next_id.blocking_lock();
        assert_eq!(*next_id, 1);
    }

    #[tokio::test]
    async fn generate_id_increments() {
        let manager = SessionManager::new();
        let id1 = manager.generate_id().await;
        let id2 = manager.generate_id().await;
        assert_eq!(id1, "session-1");
        assert_eq!(id2, "session-2");
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

    #[test]
    fn session_info_serializes_correctly() {
        let info = SessionInfo {
            id: "session-1".to_string(),
            pid: Some(12345),
            cwd: "/tmp/test".to_string(),
            cli_type: CliType::ClaudeCode,
            status: SessionStatus::Running,
            elapsed_secs: 120,
        };
        let json = serde_json::to_value(&info).unwrap();
        assert_eq!(json["id"], "session-1");
        assert_eq!(json["pid"], 12345);
        assert_eq!(json["cwd"], "/tmp/test");
        assert_eq!(json["cliType"], "claude-code");
        assert_eq!(json["status"], "running");
        assert_eq!(json["elapsedSecs"], 120);
    }
}
