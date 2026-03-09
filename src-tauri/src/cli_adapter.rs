use std::path::Path;
use std::process::Stdio;
use std::sync::OnceLock;
use tokio::process::Command;

static SHELL_PATH: OnceLock<Option<String>> = OnceLock::new();

fn get_shell_path() -> Option<&'static str> {
    SHELL_PATH
        .get_or_init(|| {
            let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
            let path_cmd = if shell.ends_with("/fish") {
                "string join : $PATH"
            } else {
                "echo $PATH"
            };
            let output = std::process::Command::new(&shell)
                .args(["-l", "-c", path_cmd])
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
    fn build_command(&self, prompt: &str, cwd: &Path, session_id: Option<&str>, extra_args: &[String]) -> Command;
}

pub struct ClaudeCodeAdapter;

impl CliAdapter for ClaudeCodeAdapter {
    fn build_command(&self, prompt: &str, cwd: &Path, session_id: Option<&str>, extra_args: &[String]) -> Command {
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

        for arg in extra_args {
            cmd.arg(arg);
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
        let cmd = adapter.build_command("hello", &cwd, None, &[]);
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
        let cmd = adapter.build_command("next prompt", &cwd, Some("sess-123"), &[]);
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
    fn build_command_with_extra_args() {
        let adapter = ClaudeCodeAdapter;
        let cwd = PathBuf::from("/tmp/test");
        let extra = vec![
            "--dangerously-skip-permissions".to_string(),
            "--model".to_string(),
            "sonnet".to_string(),
        ];
        let cmd = adapter.build_command("hello", &cwd, None, &extra);
        let as_std = cmd.as_std();

        let args: Vec<&std::ffi::OsStr> = as_std.get_args().collect();
        assert_eq!(
            args,
            vec![
                "-p",
                "hello",
                "--output-format",
                "stream-json",
                "--verbose",
                "--dangerously-skip-permissions",
                "--model",
                "sonnet",
            ]
        );
    }

    #[test]
    fn build_command_with_session_id_and_extra_args() {
        let adapter = ClaudeCodeAdapter;
        let cwd = PathBuf::from("/tmp/test");
        let extra = vec!["--max-turns".to_string(), "5".to_string()];
        let cmd = adapter.build_command("prompt", &cwd, Some("sess-1"), &extra);
        let as_std = cmd.as_std();

        let args: Vec<&std::ffi::OsStr> = as_std.get_args().collect();
        assert_eq!(
            args,
            vec![
                "-p",
                "prompt",
                "--output-format",
                "stream-json",
                "--verbose",
                "-r",
                "sess-1",
                "--max-turns",
                "5",
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
