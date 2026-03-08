use std::path::Path;
use tokio::process::Command;
use std::process::Stdio;

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
            .current_dir(cwd)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

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
        assert_eq!(args, vec!["-p", "hello", "--output-format", "stream-json"]);
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
            vec!["-p", "next prompt", "--output-format", "stream-json", "-r", "sess-123"]
        );
    }
}
