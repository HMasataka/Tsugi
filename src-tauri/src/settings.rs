use crate::session::CliType;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum ExecutionMode {
    Auto,
    Manual,
}

impl Default for ExecutionMode {
    fn default() -> Self {
        Self::Auto
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct KeyboardShortcuts {
    pub send_prompt: String,
    pub abort: String,
    pub new_session: String,
    pub close_session: String,
    pub toggle_auto_run: String,
    pub pause_resume: String,
}

impl Default for KeyboardShortcuts {
    fn default() -> Self {
        Self {
            send_prompt: "Ctrl+Enter".to_string(),
            abort: "Ctrl+C".to_string(),
            new_session: "Ctrl+N".to_string(),
            close_session: "Ctrl+W".to_string(),
            toggle_auto_run: "Ctrl+Shift+A".to_string(),
            pause_resume: "Ctrl+Shift+P".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub default_cli_type: CliType,
    pub default_execution_mode: ExecutionMode,
    pub default_timeout_secs: u32,
    pub auto_retry_on_failure: bool,
    pub notify_on_completion: bool,
    pub notify_on_error: bool,
    pub notify_on_approval: bool,
    pub auto_worktree_for_flows: bool,
    pub keyboard_shortcuts: KeyboardShortcuts,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            default_cli_type: CliType::ClaudeCode,
            default_execution_mode: ExecutionMode::Auto,
            default_timeout_secs: 300,
            auto_retry_on_failure: false,
            notify_on_completion: true,
            notify_on_error: true,
            notify_on_approval: true,
            auto_worktree_for_flows: false,
            keyboard_shortcuts: KeyboardShortcuts::default(),
        }
    }
}

pub struct SettingsStore {
    data: Mutex<Settings>,
    file_path: PathBuf,
}

impl SettingsStore {
    pub fn new() -> Self {
        let config_dir = dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("tsugi");

        Self {
            data: Mutex::new(Settings::default()),
            file_path: config_dir.join("settings.json"),
        }
    }

    pub fn load_blocking(&self) -> Result<(), String> {
        if !self.file_path.exists() {
            return Ok(());
        }
        let content = std::fs::read_to_string(&self.file_path)
            .map_err(|e| format!("Failed to read settings file: {}", e))?;
        let data: Settings = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse settings file: {}", e))?;

        let mut lock = self.data.lock().map_err(|e| e.to_string())?;
        *lock = data;
        Ok(())
    }

    fn save(&self) -> Result<(), String> {
        let lock = self.data.lock().map_err(|e| e.to_string())?;

        if let Some(parent) = self.file_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create config directory: {}", e))?;
        }

        let content = serde_json::to_string_pretty(&*lock)
            .map_err(|e| format!("Failed to serialize settings: {}", e))?;
        std::fs::write(&self.file_path, content)
            .map_err(|e| format!("Failed to write settings file: {}", e))?;

        Ok(())
    }

    pub fn get(&self) -> Result<Settings, String> {
        let lock = self.data.lock().map_err(|e| e.to_string())?;
        Ok(lock.clone())
    }

    pub fn update(&self, settings: Settings) -> Result<Settings, String> {
        let mut lock = self.data.lock().map_err(|e| e.to_string())?;
        *lock = settings;
        let updated = lock.clone();
        drop(lock);
        self.save()?;
        Ok(updated)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::util;
    use std::fs;

    fn temp_store() -> SettingsStore {
        let dir = std::env::temp_dir().join(format!("tsugi-settings-test-{}", util::generate_id()));
        fs::create_dir_all(&dir).unwrap();
        SettingsStore {
            data: Mutex::new(Settings::default()),
            file_path: dir.join("settings.json"),
        }
    }

    #[test]
    fn default_settings_values() {
        let settings = Settings::default();
        assert_eq!(settings.default_cli_type, CliType::ClaudeCode);
        assert_eq!(settings.default_execution_mode, ExecutionMode::Auto);
        assert_eq!(settings.default_timeout_secs, 300);
        assert!(!settings.auto_retry_on_failure);
        assert!(settings.notify_on_completion);
        assert!(settings.notify_on_error);
        assert!(settings.notify_on_approval);
        assert!(!settings.auto_worktree_for_flows);
    }

    #[test]
    fn default_keyboard_shortcuts() {
        let shortcuts = KeyboardShortcuts::default();
        assert_eq!(shortcuts.send_prompt, "Ctrl+Enter");
        assert_eq!(shortcuts.abort, "Ctrl+C");
        assert_eq!(shortcuts.new_session, "Ctrl+N");
        assert_eq!(shortcuts.close_session, "Ctrl+W");
        assert_eq!(shortcuts.toggle_auto_run, "Ctrl+Shift+A");
        assert_eq!(shortcuts.pause_resume, "Ctrl+Shift+P");
    }

    #[test]
    fn get_returns_default_settings() {
        let store = temp_store();
        let settings = store.get().unwrap();
        assert_eq!(settings.default_cli_type, CliType::ClaudeCode);
        assert_eq!(settings.default_timeout_secs, 300);
    }

    #[test]
    fn update_persists_and_returns_new_settings() {
        let store = temp_store();

        let mut new_settings = Settings::default();
        new_settings.default_cli_type = CliType::Codex;
        new_settings.default_timeout_secs = 600;
        new_settings.notify_on_completion = false;

        let updated = store.update(new_settings).unwrap();
        assert_eq!(updated.default_cli_type, CliType::Codex);
        assert_eq!(updated.default_timeout_secs, 600);
        assert!(!updated.notify_on_completion);

        let current = store.get().unwrap();
        assert_eq!(current.default_cli_type, CliType::Codex);
    }

    #[test]
    fn persistence_roundtrip() {
        let store = temp_store();
        let file_path = store.file_path.clone();

        let mut new_settings = Settings::default();
        new_settings.default_execution_mode = ExecutionMode::Manual;
        new_settings.auto_worktree_for_flows = true;
        new_settings.keyboard_shortcuts.abort = "Ctrl+X".to_string();
        store.update(new_settings).unwrap();

        let store2 = SettingsStore {
            data: Mutex::new(Settings::default()),
            file_path,
        };
        store2.load_blocking().unwrap();

        let loaded = store2.get().unwrap();
        assert_eq!(loaded.default_execution_mode, ExecutionMode::Manual);
        assert!(loaded.auto_worktree_for_flows);
        assert_eq!(loaded.keyboard_shortcuts.abort, "Ctrl+X");
    }

    #[test]
    fn load_nonexistent_file_is_ok() {
        let store = SettingsStore {
            data: Mutex::new(Settings::default()),
            file_path: PathBuf::from("/tmp/nonexistent-tsugi-settings-test/settings.json"),
        };
        let result = store.load_blocking();
        assert!(result.is_ok());
    }

    #[test]
    fn settings_serializes_correctly() {
        let settings = Settings::default();
        let json = serde_json::to_value(&settings).unwrap();
        assert_eq!(json["defaultCliType"], "claude-code");
        assert_eq!(json["defaultExecutionMode"], "auto");
        assert_eq!(json["defaultTimeoutSecs"], 300);
        assert_eq!(json["autoRetryOnFailure"], false);
        assert_eq!(json["notifyOnCompletion"], true);
        assert_eq!(json["notifyOnError"], true);
        assert_eq!(json["notifyOnApproval"], true);
        assert_eq!(json["autoWorktreeForFlows"], false);
        assert_eq!(json["keyboardShortcuts"]["sendPrompt"], "Ctrl+Enter");
        assert_eq!(json["keyboardShortcuts"]["abort"], "Ctrl+C");
    }

    #[test]
    fn settings_deserializes_correctly() {
        let json_str = r#"{
            "defaultCliType": "codex",
            "defaultExecutionMode": "manual",
            "defaultTimeoutSecs": 120,
            "autoRetryOnFailure": true,
            "notifyOnCompletion": false,
            "notifyOnError": false,
            "notifyOnApproval": false,
            "autoWorktreeForFlows": true,
            "keyboardShortcuts": {
                "sendPrompt": "Ctrl+Enter",
                "abort": "Ctrl+C",
                "newSession": "Ctrl+N",
                "closeSession": "Ctrl+W",
                "toggleAutoRun": "Ctrl+Shift+A",
                "pauseResume": "Ctrl+Shift+P"
            }
        }"#;
        let settings: Settings = serde_json::from_str(json_str).unwrap();
        assert_eq!(settings.default_cli_type, CliType::Codex);
        assert_eq!(settings.default_execution_mode, ExecutionMode::Manual);
        assert_eq!(settings.default_timeout_secs, 120);
        assert!(settings.auto_retry_on_failure);
        assert!(!settings.notify_on_completion);
        assert!(settings.auto_worktree_for_flows);
    }

    #[test]
    fn partial_json_deserializes_with_defaults() {
        let json_str = r#"{
            "defaultTimeoutSecs": 600
        }"#;
        let settings: Settings = serde_json::from_str(json_str).unwrap();
        assert_eq!(settings.default_cli_type, CliType::ClaudeCode);
        assert_eq!(settings.default_execution_mode, ExecutionMode::Auto);
        assert_eq!(settings.default_timeout_secs, 600);
        assert!(settings.notify_on_completion);
        assert_eq!(settings.keyboard_shortcuts.send_prompt, "Ctrl+Enter");
    }

    #[test]
    fn empty_json_deserializes_to_defaults() {
        let json_str = r#"{}"#;
        let settings: Settings = serde_json::from_str(json_str).unwrap();
        assert_eq!(settings.default_cli_type, CliType::ClaudeCode);
        assert_eq!(settings.default_timeout_secs, 300);
    }

    #[test]
    fn partial_keyboard_shortcuts_deserializes_with_defaults() {
        let json_str = r#"{
            "keyboardShortcuts": {
                "abort": "Ctrl+X"
            }
        }"#;
        let settings: Settings = serde_json::from_str(json_str).unwrap();
        assert_eq!(settings.keyboard_shortcuts.abort, "Ctrl+X");
        assert_eq!(settings.keyboard_shortcuts.send_prompt, "Ctrl+Enter");
    }
}
