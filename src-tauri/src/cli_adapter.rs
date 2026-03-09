use std::path::Path;
use std::process::Stdio;
use std::sync::OnceLock;
use tokio::process::Command;

static SHELL_PATH: OnceLock<Option<String>> = OnceLock::new();

fn get_shell_path() -> Option<&'static str> {
    SHELL_PATH
        .get_or_init(|| {
            let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
            let output = std::process::Command::new(&shell)
                .args(["-l", "-c", "echo $PATH"])
                .stdout(Stdio::piped())
                .stderr(Stdio::null())
                .output()
                .ok()?;
            let path = String::from_utf8(output.stdout).ok()?.trim().to_string();
            if path.is_empty() {
                None
            } else {
                Some(path)
            }
        })
        .as_deref()
}

pub trait CliAdapter: Send + Sync {
    fn build_command(&self, prompt: &str, cwd: &Path, session_id: Option<&str>) -> Command;
}

pub struct ClaudeCodeAdapter;

impl CliAdapter for ClaudeCodeAdapter {
    fn build_command(&self, prompt: &str, cwd: &Path, session_id: Option<&str>) -> Command {
        let mut cmd = Command::new("claude");
        cmd.arg("-p")
            .arg(prompt)
            .arg("--output-format")
            .arg("stream-json")
            .arg("--verbose")
            .current_dir(cwd)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        if let Some(path) = get_shell_path() {
            cmd.env("PATH", path);
        }

        if let Some(id) = session_id {
            cmd.arg("-r").arg(id);
        }

        cmd
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn build_command_without_session_id() {
        let adapter = ClaudeCodeAdapter;
        let cwd = PathBuf::from("/tmp/test");
        let cmd = adapter.build_command("hello", &cwd, None);
        let as_std = cmd.as_std();

        let args: Vec<&std::ffi::OsStr> = as_std.get_args().collect();
        assert_eq!(
            args,
            vec!["-p", "hello", "--output-format", "stream-json", "--verbose"]
        );
        assert_eq!(as_std.get_current_dir(), Some(Path::new("/tmp/test")));
    }

    #[test]
    fn build_command_with_session_id() {
        let adapter = ClaudeCodeAdapter;
        let cwd = PathBuf::from("/tmp/test");
        let cmd = adapter.build_command("next prompt", &cwd, Some("sess-123"));
        let as_std = cmd.as_std();

        let args: Vec<&std::ffi::OsStr> = as_std.get_args().collect();
        assert_eq!(
            args,
            vec![
                "-p",
                "next prompt",
                "--output-format",
                "stream-json",
                "--verbose",
                "-r",
                "sess-123"
            ]
        );
    }

    #[test]
    fn get_shell_path_returns_some() {
        let path = get_shell_path();
        assert!(path.is_some());
        assert!(!path.unwrap().is_empty());
    }
}
