use std::path::{Path, PathBuf};
use tokio::process::Command;

pub async fn create_worktree(repo_dir: &Path) -> Result<PathBuf, String> {
    let worktree_name = format!(".tsugi-worktree-{}", crate::util::generate_id());
    let worktree_path = repo_dir.join(&worktree_name);

    let output = Command::new("git")
        .args(["worktree", "add", "--detach"])
        .arg(&worktree_path)
        .arg("HEAD")
        .current_dir(repo_dir)
        .output()
        .await
        .map_err(|e| format!("Failed to run git worktree add: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git worktree add failed: {}", stderr));
    }

    Ok(worktree_path)
}

pub async fn remove_worktree(repo_dir: &Path, worktree_path: &Path) -> Result<(), String> {
    let output = Command::new("git")
        .args(["worktree", "remove", "--force"])
        .arg(worktree_path)
        .current_dir(repo_dir)
        .output()
        .await
        .map_err(|e| format!("Failed to run git worktree remove: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git worktree remove failed: {}", stderr));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    async fn create_test_repo() -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "tsugi-worktree-test-{}",
            crate::util::generate_id()
        ));
        fs::create_dir_all(&dir).unwrap();

        Command::new("git")
            .args(["init"])
            .current_dir(&dir)
            .output()
            .await
            .unwrap();

        Command::new("git")
            .args(["config", "user.email", "test@test.com"])
            .current_dir(&dir)
            .output()
            .await
            .unwrap();

        Command::new("git")
            .args(["config", "user.name", "Test"])
            .current_dir(&dir)
            .output()
            .await
            .unwrap();

        fs::write(dir.join("README.md"), "test").unwrap();

        Command::new("git")
            .args(["add", "."])
            .current_dir(&dir)
            .output()
            .await
            .unwrap();

        Command::new("git")
            .args(["commit", "-m", "initial"])
            .current_dir(&dir)
            .output()
            .await
            .unwrap();

        dir
    }

    #[tokio::test]
    async fn create_and_remove_worktree() {
        let repo = create_test_repo().await;

        let wt_path = create_worktree(&repo).await.unwrap();
        assert!(wt_path.exists());
        assert!(wt_path.is_dir());

        // Verify README.md is in the worktree
        assert!(wt_path.join("README.md").exists());

        remove_worktree(&repo, &wt_path).await.unwrap();
        assert!(!wt_path.exists());

        // Clean up
        let _ = fs::remove_dir_all(&repo);
    }

    #[tokio::test]
    async fn create_worktree_in_non_git_dir_fails() {
        let dir = std::env::temp_dir().join(format!(
            "tsugi-worktree-nogit-{}",
            crate::util::generate_id()
        ));
        fs::create_dir_all(&dir).unwrap();

        let result = create_worktree(&dir).await;
        assert!(result.is_err());

        let _ = fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn remove_nonexistent_worktree_fails() {
        let repo = create_test_repo().await;
        let fake_path = repo.join(".tsugi-worktree-nonexistent");

        let result = remove_worktree(&repo, &fake_path).await;
        assert!(result.is_err());

        let _ = fs::remove_dir_all(&repo);
    }
}
