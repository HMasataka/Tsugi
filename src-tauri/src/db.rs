use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::Mutex;

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn open(db_path: PathBuf) -> Result<Self, String> {
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create database directory: {}", e))?;
        }

        let conn =
            Connection::open(&db_path).map_err(|e| format!("Failed to open database: {}", e))?;

        let db = Self {
            conn: Mutex::new(conn),
        };
        db.migrate()?;
        Ok(db)
    }

    pub fn with_conn<F, T>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&Connection) -> Result<T, rusqlite::Error>,
    {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        f(&conn).map_err(|e| format!("Database error: {}", e))
    }

    fn migrate(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;

        let version: u32 = conn
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .map_err(|e| format!("Failed to read user_version: {}", e))?;

        if version < 1 {
            conn.execute_batch(
                "CREATE TABLE executions (
                    id          TEXT PRIMARY KEY,
                    cwd         TEXT NOT NULL,
                    cli_type    TEXT NOT NULL,
                    status      TEXT NOT NULL,
                    started_at  INTEGER NOT NULL,
                    finished_at INTEGER,
                    total_input_tokens  INTEGER NOT NULL DEFAULT 0,
                    total_output_tokens INTEGER NOT NULL DEFAULT 0
                );

                CREATE TABLE execution_steps (
                    id            TEXT PRIMARY KEY,
                    execution_id  TEXT NOT NULL REFERENCES executions(id),
                    step_order    INTEGER NOT NULL,
                    prompt        TEXT NOT NULL,
                    status        TEXT NOT NULL,
                    started_at    INTEGER NOT NULL,
                    finished_at   INTEGER,
                    exit_code     INTEGER,
                    input_tokens  INTEGER NOT NULL DEFAULT 0,
                    output_tokens INTEGER NOT NULL DEFAULT 0
                );

                CREATE TABLE step_outputs (
                    id        INTEGER PRIMARY KEY AUTOINCREMENT,
                    step_id   TEXT NOT NULL REFERENCES execution_steps(id),
                    seq       INTEGER NOT NULL,
                    raw_json  TEXT NOT NULL
                );

                CREATE INDEX idx_executions_cwd ON executions(cwd);
                CREATE INDEX idx_executions_started_at ON executions(started_at);
                CREATE INDEX idx_execution_steps_execution_id ON execution_steps(execution_id);
                CREATE INDEX idx_step_outputs_step_id ON step_outputs(step_id);

                PRAGMA user_version = 1;",
            )
            .map_err(|e| format!("Migration v1 failed: {}", e))?;
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn temp_db_path() -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "tsugi-test-db-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        ));
        dir.join("test.db")
    }

    #[test]
    fn open_creates_database_and_tables() {
        let path = temp_db_path();
        let db = Database::open(path).unwrap();

        let tables: Vec<String> = db
            .with_conn(|conn| {
                let mut stmt = conn
                    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")?;
                let rows = stmt.query_map([], |row| row.get(0))?;
                rows.collect()
            })
            .unwrap();

        assert!(tables.contains(&"executions".to_string()));
        assert!(tables.contains(&"execution_steps".to_string()));
        assert!(tables.contains(&"step_outputs".to_string()));
    }

    #[test]
    fn migration_is_idempotent() {
        let path = temp_db_path();
        let db = Database::open(path.clone()).unwrap();
        drop(db);

        // Re-opening should not fail
        let db2 = Database::open(path).unwrap();

        let version: u32 = db2
            .with_conn(|conn| conn.pragma_query_value(None, "user_version", |row| row.get(0)))
            .unwrap();
        assert_eq!(version, 1);
    }

    #[test]
    fn with_conn_executes_closure() {
        let path = temp_db_path();
        let db = Database::open(path).unwrap();

        let result: i64 = db
            .with_conn(|conn| conn.query_row("SELECT 42", [], |row| row.get(0)))
            .unwrap();
        assert_eq!(result, 42);
    }
}
