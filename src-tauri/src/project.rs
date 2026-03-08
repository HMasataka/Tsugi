use crate::session::CliType;
use crate::util;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

const MAX_RECENT_DIRS: usize = 20;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
    pub cli_type: CliType,
    pub last_opened_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentDirectory {
    pub path: String,
    pub last_used_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ProjectData {
    projects: Vec<Project>,
    recent_dirs: Vec<RecentDirectory>,
}

pub struct ProjectStore {
    data: Mutex<ProjectData>,
    file_path: PathBuf,
}

impl ProjectStore {
    pub fn new() -> Self {
        let config_dir = dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("tsugi");

        Self {
            data: Mutex::new(ProjectData::default()),
            file_path: config_dir.join("projects.json"),
        }
    }

    pub fn load_blocking(&self) -> Result<(), String> {
        if !self.file_path.exists() {
            return Ok(());
        }
        let content = std::fs::read_to_string(&self.file_path)
            .map_err(|e| format!("Failed to read projects file: {}", e))?;
        let data: ProjectData = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse projects file: {}", e))?;

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
            .map_err(|e| format!("Failed to serialize projects: {}", e))?;
        std::fs::write(&self.file_path, content)
            .map_err(|e| format!("Failed to write projects file: {}", e))?;

        Ok(())
    }

    pub fn register(
        &self,
        name: String,
        path: String,
        cli_type: CliType,
    ) -> Result<Project, String> {
        let mut lock = self.data.lock().map_err(|e| e.to_string())?;

        if lock.projects.iter().any(|p| p.path == path) {
            return Err(format!("Project already registered: {}", path));
        }

        let project = Project {
            id: util::generate_id(),
            name,
            path: path.clone(),
            cli_type,
            last_opened_at: util::now_millis(),
        };

        lock.projects.push(project.clone());

        // Remove from recent_dirs if it was there
        lock.recent_dirs.retain(|d| d.path != path);

        drop(lock);
        self.save()?;

        Ok(project)
    }

    pub fn unregister(&self, project_id: &str) -> Result<(), String> {
        let mut lock = self.data.lock().map_err(|e| e.to_string())?;

        let before = lock.projects.len();
        lock.projects.retain(|p| p.id != project_id);
        if lock.projects.len() == before {
            return Err(format!("Project not found: {}", project_id));
        }

        drop(lock);
        self.save()?;
        Ok(())
    }

    pub fn list_projects(&self) -> Result<Vec<Project>, String> {
        let lock = self.data.lock().map_err(|e| e.to_string())?;
        Ok(lock.projects.clone())
    }

    pub fn list_recent_dirs(&self) -> Result<Vec<RecentDirectory>, String> {
        let lock = self.data.lock().map_err(|e| e.to_string())?;
        let registered_paths: Vec<&str> = lock.projects.iter().map(|p| p.path.as_str()).collect();

        let filtered: Vec<RecentDirectory> = lock
            .recent_dirs
            .iter()
            .filter(|d| !registered_paths.contains(&d.path.as_str()))
            .cloned()
            .collect();

        Ok(filtered)
    }

    pub fn record_recent_dir(&self, path: &str) -> Result<(), String> {
        let mut lock = self.data.lock().map_err(|e| e.to_string())?;

        lock.recent_dirs.retain(|d| d.path != path);
        lock.recent_dirs.insert(
            0,
            RecentDirectory {
                path: path.to_string(),
                last_used_at: util::now_millis(),
            },
        );

        if lock.recent_dirs.len() > MAX_RECENT_DIRS {
            lock.recent_dirs.truncate(MAX_RECENT_DIRS);
        }

        drop(lock);
        self.save()?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn temp_store() -> ProjectStore {
        let dir = std::env::temp_dir().join(format!("tsugi-test-{}", util::generate_id()));
        fs::create_dir_all(&dir).unwrap();
        ProjectStore {
            data: Mutex::new(ProjectData::default()),
            file_path: dir.join("projects.json"),
        }
    }

    #[test]
    fn register_and_list_projects() {
        let store = temp_store();

        let project = store
            .register(
                "MyProject".to_string(),
                "/tmp/myproject".to_string(),
                CliType::ClaudeCode,
            )
            .unwrap();

        assert_eq!(project.name, "MyProject");
        assert_eq!(project.path, "/tmp/myproject");

        let projects = store.list_projects().unwrap();
        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0].name, "MyProject");
    }

    #[test]
    fn register_duplicate_path_fails() {
        let store = temp_store();

        store
            .register(
                "First".to_string(),
                "/tmp/dup".to_string(),
                CliType::ClaudeCode,
            )
            .unwrap();

        let result = store.register(
            "Second".to_string(),
            "/tmp/dup".to_string(),
            CliType::ClaudeCode,
        );
        assert!(result.is_err());
    }

    #[test]
    fn unregister_removes_project() {
        let store = temp_store();

        let project = store
            .register(
                "ToRemove".to_string(),
                "/tmp/remove".to_string(),
                CliType::ClaudeCode,
            )
            .unwrap();

        store.unregister(&project.id).unwrap();

        let projects = store.list_projects().unwrap();
        assert!(projects.is_empty());
    }

    #[test]
    fn unregister_nonexistent_fails() {
        let store = temp_store();
        let result = store.unregister("nonexistent");
        assert!(result.is_err());
    }

    #[test]
    fn record_recent_dir_adds_and_deduplicates() {
        let store = temp_store();

        store.record_recent_dir("/tmp/dir1").unwrap();
        store.record_recent_dir("/tmp/dir2").unwrap();
        store.record_recent_dir("/tmp/dir1").unwrap();

        let dirs = store.list_recent_dirs().unwrap();
        assert_eq!(dirs.len(), 2);
        assert_eq!(dirs[0].path, "/tmp/dir1");
        assert_eq!(dirs[1].path, "/tmp/dir2");
    }

    #[test]
    fn recent_dirs_capped_at_max() {
        let store = temp_store();

        for i in 0..25 {
            store.record_recent_dir(&format!("/tmp/dir{}", i)).unwrap();
        }

        let dirs = store.list_recent_dirs().unwrap();
        assert_eq!(dirs.len(), MAX_RECENT_DIRS);
    }

    #[test]
    fn recent_dirs_excludes_registered_projects() {
        let store = temp_store();

        store.record_recent_dir("/tmp/registered").unwrap();
        store.record_recent_dir("/tmp/unregistered").unwrap();

        store
            .register(
                "Registered".to_string(),
                "/tmp/registered".to_string(),
                CliType::ClaudeCode,
            )
            .unwrap();

        let dirs = store.list_recent_dirs().unwrap();
        assert_eq!(dirs.len(), 1);
        assert_eq!(dirs[0].path, "/tmp/unregistered");
    }

    #[test]
    fn register_removes_from_recent_dirs() {
        let store = temp_store();

        store.record_recent_dir("/tmp/soon-registered").unwrap();

        let dirs = store.list_recent_dirs().unwrap();
        assert_eq!(dirs.len(), 1);

        store
            .register(
                "New".to_string(),
                "/tmp/soon-registered".to_string(),
                CliType::ClaudeCode,
            )
            .unwrap();

        let dirs = store.list_recent_dirs().unwrap();
        assert!(dirs.is_empty());
    }

    #[test]
    fn persistence_roundtrip() {
        let store = temp_store();
        let file_path = store.file_path.clone();

        store
            .register(
                "Persist".to_string(),
                "/tmp/persist".to_string(),
                CliType::ClaudeCode,
            )
            .unwrap();
        store.record_recent_dir("/tmp/recent").unwrap();

        // Create a new store pointing to the same file
        let store2 = ProjectStore {
            data: Mutex::new(ProjectData::default()),
            file_path,
        };
        store2.load_blocking().unwrap();

        let projects = store2.list_projects().unwrap();
        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0].name, "Persist");

        let dirs = store2.list_recent_dirs().unwrap();
        assert_eq!(dirs.len(), 1);
        assert_eq!(dirs[0].path, "/tmp/recent");
    }

    #[test]
    fn project_serializes_correctly() {
        let project = Project {
            id: "test-id".to_string(),
            name: "Test".to_string(),
            path: "/tmp/test".to_string(),
            cli_type: CliType::ClaudeCode,
            last_opened_at: 1700000000000,
        };
        let json = serde_json::to_value(&project).unwrap();
        assert_eq!(json["id"], "test-id");
        assert_eq!(json["name"], "Test");
        assert_eq!(json["path"], "/tmp/test");
        assert_eq!(json["cliType"], "claude-code");
        assert_eq!(json["lastOpenedAt"], 1700000000000i64);
    }
}
