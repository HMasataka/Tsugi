use crate::db::Database;
use crate::util;
use rusqlite::params;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Execution {
    pub id: String,
    pub cwd: String,
    pub cli_type: String,
    pub status: String,
    pub started_at: i64,
    pub finished_at: Option<i64>,
    pub total_input_tokens: i64,
    pub total_output_tokens: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionStep {
    pub id: String,
    pub execution_id: String,
    pub step_order: i64,
    pub prompt: String,
    pub status: String,
    pub started_at: i64,
    pub finished_at: Option<i64>,
    pub exit_code: Option<i32>,
    pub input_tokens: i64,
    pub output_tokens: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StepOutput {
    pub id: i64,
    pub step_id: String,
    pub seq: i64,
    pub raw_json: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionSummary {
    pub id: String,
    pub cwd: String,
    pub cli_type: String,
    pub status: String,
    pub started_at: i64,
    pub finished_at: Option<i64>,
    pub step_count: i64,
    pub total_input_tokens: i64,
    pub total_output_tokens: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionDetail {
    pub execution: ExecutionSummary,
    pub steps: Vec<ExecutionStepInfo>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionStepInfo {
    pub id: String,
    pub step_order: i64,
    pub prompt: String,
    pub status: String,
    pub started_at: i64,
    pub finished_at: Option<i64>,
    pub exit_code: Option<i32>,
    pub input_tokens: i64,
    pub output_tokens: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryFilter {
    pub cwd: Option<String>,
    pub status: Option<String>,
    pub keyword: Option<String>,
    pub date_from: Option<i64>,
    pub date_to: Option<i64>,
    pub limit: u32,
    pub offset: u32,
}

pub fn create_execution(db: &Database, execution: &Execution) -> Result<(), String> {
    db.with_conn(|conn| {
        conn.execute(
            "INSERT INTO executions (id, cwd, cli_type, status, started_at, finished_at, total_input_tokens, total_output_tokens)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                execution.id,
                execution.cwd,
                execution.cli_type,
                execution.status,
                execution.started_at,
                execution.finished_at,
                execution.total_input_tokens,
                execution.total_output_tokens,
            ],
        )?;
        Ok(())
    })
}

pub fn finish_execution(db: &Database, id: &str, status: &str) -> Result<(), String> {
    let now = util::now_millis();
    db.with_conn(|conn| {
        conn.execute(
            "UPDATE executions SET status = ?1, finished_at = ?2 WHERE id = ?3",
            params![status, now, id],
        )?;
        Ok(())
    })
}

pub fn create_step(db: &Database, step: &ExecutionStep) -> Result<(), String> {
    db.with_conn(|conn| {
        conn.execute(
            "INSERT INTO execution_steps (id, execution_id, step_order, prompt, status, started_at, finished_at, exit_code, input_tokens, output_tokens)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                step.id,
                step.execution_id,
                step.step_order,
                step.prompt,
                step.status,
                step.started_at,
                step.finished_at,
                step.exit_code,
                step.input_tokens,
                step.output_tokens,
            ],
        )?;
        Ok(())
    })
}

pub fn finish_step(
    db: &Database,
    step_id: &str,
    status: &str,
    exit_code: Option<i32>,
    input_tokens: i64,
    output_tokens: i64,
) -> Result<(), String> {
    let now = util::now_millis();
    db.with_conn(|conn| {
        conn.execute(
            "UPDATE execution_steps SET status = ?1, finished_at = ?2, exit_code = ?3, input_tokens = ?4, output_tokens = ?5 WHERE id = ?6",
            params![status, now, exit_code, input_tokens, output_tokens, step_id],
        )?;

        // Update execution token totals
        conn.execute(
            "UPDATE executions SET
                total_input_tokens = (SELECT COALESCE(SUM(input_tokens), 0) FROM execution_steps WHERE execution_id = (SELECT execution_id FROM execution_steps WHERE id = ?1)),
                total_output_tokens = (SELECT COALESCE(SUM(output_tokens), 0) FROM execution_steps WHERE execution_id = (SELECT execution_id FROM execution_steps WHERE id = ?1))
             WHERE id = (SELECT execution_id FROM execution_steps WHERE id = ?1)",
            params![step_id],
        )?;
        Ok(())
    })
}

pub fn append_output(db: &Database, step_id: &str, seq: i64, raw_json: &str) -> Result<(), String> {
    db.with_conn(|conn| {
        conn.execute(
            "INSERT INTO step_outputs (step_id, seq, raw_json) VALUES (?1, ?2, ?3)",
            params![step_id, seq, raw_json],
        )?;
        Ok(())
    })
}

pub fn list_executions(db: &Database, filter: &HistoryFilter) -> Result<Vec<ExecutionSummary>, String> {
    db.with_conn(|conn| {
        let mut sql = String::from(
            "SELECT e.id, e.cwd, e.cli_type, e.status, e.started_at, e.finished_at,
                    e.total_input_tokens, e.total_output_tokens,
                    (SELECT COUNT(*) FROM execution_steps WHERE execution_id = e.id) as step_count
             FROM executions e WHERE 1=1"
        );
        let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
        let mut param_idx = 1;

        if let Some(cwd) = &filter.cwd {
            sql.push_str(&format!(" AND e.cwd LIKE ?{}", param_idx));
            param_values.push(Box::new(format!("%{}%", cwd)));
            param_idx += 1;
        }

        if let Some(status) = &filter.status {
            sql.push_str(&format!(" AND e.status = ?{}", param_idx));
            param_values.push(Box::new(status.clone()));
            param_idx += 1;
        }

        if let Some(keyword) = &filter.keyword {
            sql.push_str(&format!(
                " AND (e.cwd LIKE ?{0} OR EXISTS (SELECT 1 FROM execution_steps es WHERE es.execution_id = e.id AND es.prompt LIKE ?{0}))",
                param_idx
            ));
            param_values.push(Box::new(format!("%{}%", keyword)));
            param_idx += 1;
        }

        if let Some(date_from) = filter.date_from {
            sql.push_str(&format!(" AND e.started_at >= ?{}", param_idx));
            param_values.push(Box::new(date_from));
            param_idx += 1;
        }

        if let Some(date_to) = filter.date_to {
            sql.push_str(&format!(" AND e.started_at <= ?{}", param_idx));
            param_values.push(Box::new(date_to));
            param_idx += 1;
        }

        sql.push_str(" ORDER BY e.started_at DESC");
        sql.push_str(&format!(" LIMIT ?{} OFFSET ?{}", param_idx, param_idx + 1));
        param_values.push(Box::new(filter.limit));
        param_values.push(Box::new(filter.offset));

        let params_refs: Vec<&dyn rusqlite::types::ToSql> =
            param_values.iter().map(|p| p.as_ref()).collect();

        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(params_refs.as_slice(), |row| {
            Ok(ExecutionSummary {
                id: row.get(0)?,
                cwd: row.get(1)?,
                cli_type: row.get(2)?,
                status: row.get(3)?,
                started_at: row.get(4)?,
                finished_at: row.get(5)?,
                total_input_tokens: row.get(6)?,
                total_output_tokens: row.get(7)?,
                step_count: row.get(8)?,
            })
        })?;

        rows.collect()
    })
}

pub fn get_execution_detail(db: &Database, execution_id: &str) -> Result<ExecutionDetail, String> {
    let summary = db.with_conn(|conn| {
        conn.query_row(
            "SELECT e.id, e.cwd, e.cli_type, e.status, e.started_at, e.finished_at,
                    e.total_input_tokens, e.total_output_tokens,
                    (SELECT COUNT(*) FROM execution_steps WHERE execution_id = e.id) as step_count
             FROM executions e WHERE e.id = ?1",
            params![execution_id],
            |row| {
                Ok(ExecutionSummary {
                    id: row.get(0)?,
                    cwd: row.get(1)?,
                    cli_type: row.get(2)?,
                    status: row.get(3)?,
                    started_at: row.get(4)?,
                    finished_at: row.get(5)?,
                    total_input_tokens: row.get(6)?,
                    total_output_tokens: row.get(7)?,
                    step_count: row.get(8)?,
                })
            },
        )
    })?;

    let steps = db.with_conn(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, step_order, prompt, status, started_at, finished_at, exit_code, input_tokens, output_tokens
             FROM execution_steps WHERE execution_id = ?1 ORDER BY step_order",
        )?;
        let rows = stmt.query_map(params![execution_id], |row| {
            Ok(ExecutionStepInfo {
                id: row.get(0)?,
                step_order: row.get(1)?,
                prompt: row.get(2)?,
                status: row.get(3)?,
                started_at: row.get(4)?,
                finished_at: row.get(5)?,
                exit_code: row.get(6)?,
                input_tokens: row.get(7)?,
                output_tokens: row.get(8)?,
            })
        })?;
        rows.collect()
    })?;

    Ok(ExecutionDetail {
        execution: summary,
        steps,
    })
}

pub fn get_step_outputs(db: &Database, step_id: &str) -> Result<Vec<StepOutput>, String> {
    db.with_conn(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, step_id, seq, raw_json FROM step_outputs WHERE step_id = ?1 ORDER BY seq",
        )?;
        let rows = stmt.query_map(params![step_id], |row| {
            Ok(StepOutput {
                id: row.get(0)?,
                step_id: row.get(1)?,
                seq: row.get(2)?,
                raw_json: row.get(3)?,
            })
        })?;
        rows.collect()
    })
}

pub fn export_execution(db: &Database, execution_id: &str) -> Result<String, String> {
    let detail = get_execution_detail(db, execution_id)?;

    let mut steps_with_outputs: Vec<serde_json::Value> = Vec::new();
    for step in &detail.steps {
        let outputs = get_step_outputs(db, &step.id)?;
        let output_jsons: Vec<serde_json::Value> = outputs
            .iter()
            .filter_map(|o| serde_json::from_str(&o.raw_json).ok())
            .collect();

        steps_with_outputs.push(serde_json::json!({
            "id": step.id,
            "stepOrder": step.step_order,
            "prompt": step.prompt,
            "status": step.status,
            "startedAt": step.started_at,
            "finishedAt": step.finished_at,
            "exitCode": step.exit_code,
            "inputTokens": step.input_tokens,
            "outputTokens": step.output_tokens,
            "outputs": output_jsons,
        }));
    }

    let export = serde_json::json!({
        "id": detail.execution.id,
        "cwd": detail.execution.cwd,
        "cliType": detail.execution.cli_type,
        "status": detail.execution.status,
        "startedAt": detail.execution.started_at,
        "finishedAt": detail.execution.finished_at,
        "totalInputTokens": detail.execution.total_input_tokens,
        "totalOutputTokens": detail.execution.total_output_tokens,
        "steps": steps_with_outputs,
    });

    serde_json::to_string_pretty(&export)
        .map_err(|e| format!("Failed to serialize export: {}", e))
}

pub fn delete_execution(db: &Database, execution_id: &str) -> Result<(), String> {
    db.with_conn(|conn| {
        conn.execute(
            "DELETE FROM step_outputs WHERE step_id IN (SELECT id FROM execution_steps WHERE execution_id = ?1)",
            params![execution_id],
        )?;
        conn.execute(
            "DELETE FROM execution_steps WHERE execution_id = ?1",
            params![execution_id],
        )?;
        conn.execute(
            "DELETE FROM executions WHERE id = ?1",
            params![execution_id],
        )?;
        Ok(())
    })
}

pub fn get_step_count(db: &Database, execution_id: &str) -> Result<i64, String> {
    db.with_conn(|conn| {
        conn.query_row(
            "SELECT COUNT(*) FROM execution_steps WHERE execution_id = ?1",
            params![execution_id],
            |row| row.get(0),
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;

    fn temp_db() -> Database {
        let dir = std::env::temp_dir().join(format!(
            "tsugi-history-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        ));
        Database::open(dir.join("test.db")).unwrap()
    }

    fn sample_execution(id: &str) -> Execution {
        Execution {
            id: id.to_string(),
            cwd: "/tmp/test".to_string(),
            cli_type: "claude-code".to_string(),
            status: "running".to_string(),
            started_at: 1700000000000,
            finished_at: None,
            total_input_tokens: 0,
            total_output_tokens: 0,
        }
    }

    fn sample_step(id: &str, execution_id: &str, order: i64) -> ExecutionStep {
        ExecutionStep {
            id: id.to_string(),
            execution_id: execution_id.to_string(),
            step_order: order,
            prompt: format!("Prompt {}", order),
            status: "running".to_string(),
            started_at: 1700000000000 + order * 1000,
            finished_at: None,
            exit_code: None,
            input_tokens: 0,
            output_tokens: 0,
        }
    }

    #[test]
    fn create_and_finish_execution() {
        let db = temp_db();
        let exec = sample_execution("exec-1");

        create_execution(&db, &exec).unwrap();
        finish_execution(&db, "exec-1", "completed").unwrap();

        let detail = get_execution_detail(&db, "exec-1").unwrap();
        assert_eq!(detail.execution.status, "completed");
        assert!(detail.execution.finished_at.is_some());
    }

    #[test]
    fn create_step_and_finish() {
        let db = temp_db();
        create_execution(&db, &sample_execution("exec-1")).unwrap();

        let step = sample_step("step-1", "exec-1", 1);
        create_step(&db, &step).unwrap();
        finish_step(&db, "step-1", "completed", Some(0), 100, 50).unwrap();

        let detail = get_execution_detail(&db, "exec-1").unwrap();
        assert_eq!(detail.steps.len(), 1);
        assert_eq!(detail.steps[0].status, "completed");
        assert_eq!(detail.steps[0].exit_code, Some(0));
        assert_eq!(detail.steps[0].input_tokens, 100);
        assert_eq!(detail.steps[0].output_tokens, 50);
        assert_eq!(detail.execution.total_input_tokens, 100);
        assert_eq!(detail.execution.total_output_tokens, 50);
    }

    #[test]
    fn append_and_get_outputs() {
        let db = temp_db();
        create_execution(&db, &sample_execution("exec-1")).unwrap();
        create_step(&db, &sample_step("step-1", "exec-1", 1)).unwrap();

        append_output(&db, "step-1", 0, r#"{"type":"system","subtype":"init"}"#).unwrap();
        append_output(&db, "step-1", 1, r#"{"type":"assistant","message":"hello"}"#).unwrap();

        let outputs = get_step_outputs(&db, "step-1").unwrap();
        assert_eq!(outputs.len(), 2);
        assert_eq!(outputs[0].seq, 0);
        assert_eq!(outputs[1].seq, 1);
    }

    #[test]
    fn list_executions_with_no_filter() {
        let db = temp_db();
        create_execution(&db, &sample_execution("exec-1")).unwrap();
        create_execution(&db, &Execution {
            id: "exec-2".to_string(),
            cwd: "/tmp/other".to_string(),
            cli_type: "claude-code".to_string(),
            status: "completed".to_string(),
            started_at: 1700000001000,
            finished_at: Some(1700000002000),
            total_input_tokens: 200,
            total_output_tokens: 100,
        }).unwrap();

        let filter = HistoryFilter {
            cwd: None,
            status: None,
            keyword: None,
            date_from: None,
            date_to: None,
            limit: 50,
            offset: 0,
        };
        let results = list_executions(&db, &filter).unwrap();
        assert_eq!(results.len(), 2);
        // Most recent first
        assert_eq!(results[0].id, "exec-2");
    }

    #[test]
    fn list_executions_with_cwd_filter() {
        let db = temp_db();
        create_execution(&db, &sample_execution("exec-1")).unwrap();
        create_execution(&db, &Execution {
            id: "exec-2".to_string(),
            cwd: "/tmp/other".to_string(),
            ..sample_execution("exec-2")
        }).unwrap();

        let filter = HistoryFilter {
            cwd: Some("other".to_string()),
            status: None,
            keyword: None,
            date_from: None,
            date_to: None,
            limit: 50,
            offset: 0,
        };
        let results = list_executions(&db, &filter).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].cwd, "/tmp/other");
    }

    #[test]
    fn list_executions_with_status_filter() {
        let db = temp_db();
        create_execution(&db, &sample_execution("exec-1")).unwrap();
        finish_execution(&db, "exec-1", "completed").unwrap();

        create_execution(&db, &Execution {
            id: "exec-2".to_string(),
            status: "failed".to_string(),
            ..sample_execution("exec-2")
        }).unwrap();

        let filter = HistoryFilter {
            cwd: None,
            status: Some("completed".to_string()),
            keyword: None,
            date_from: None,
            date_to: None,
            limit: 50,
            offset: 0,
        };
        let results = list_executions(&db, &filter).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "exec-1");
    }

    #[test]
    fn list_executions_with_keyword_filter() {
        let db = temp_db();
        create_execution(&db, &sample_execution("exec-1")).unwrap();
        create_step(&db, &ExecutionStep {
            prompt: "Fix the authentication bug".to_string(),
            ..sample_step("step-1", "exec-1", 1)
        }).unwrap();

        create_execution(&db, &Execution {
            id: "exec-2".to_string(),
            started_at: 1700000001000,
            ..sample_execution("exec-2")
        }).unwrap();
        create_step(&db, &ExecutionStep {
            id: "step-2".to_string(),
            execution_id: "exec-2".to_string(),
            prompt: "Add new feature".to_string(),
            ..sample_step("step-2", "exec-2", 1)
        }).unwrap();

        let filter = HistoryFilter {
            cwd: None,
            status: None,
            keyword: Some("authentication".to_string()),
            date_from: None,
            date_to: None,
            limit: 50,
            offset: 0,
        };
        let results = list_executions(&db, &filter).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "exec-1");
    }

    #[test]
    fn list_executions_with_date_filter() {
        let db = temp_db();
        create_execution(&db, &Execution {
            started_at: 1700000000000,
            ..sample_execution("exec-1")
        }).unwrap();
        create_execution(&db, &Execution {
            id: "exec-2".to_string(),
            started_at: 1700000010000,
            ..sample_execution("exec-2")
        }).unwrap();

        let filter = HistoryFilter {
            cwd: None,
            status: None,
            keyword: None,
            date_from: Some(1700000005000),
            date_to: None,
            limit: 50,
            offset: 0,
        };
        let results = list_executions(&db, &filter).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "exec-2");
    }

    #[test]
    fn list_executions_pagination() {
        let db = temp_db();
        for i in 0..5 {
            create_execution(&db, &Execution {
                id: format!("exec-{}", i),
                started_at: 1700000000000 + i * 1000,
                ..sample_execution(&format!("exec-{}", i))
            }).unwrap();
        }

        let filter = HistoryFilter {
            cwd: None,
            status: None,
            keyword: None,
            date_from: None,
            date_to: None,
            limit: 2,
            offset: 0,
        };
        let page1 = list_executions(&db, &filter).unwrap();
        assert_eq!(page1.len(), 2);

        let filter2 = HistoryFilter {
            offset: 2,
            ..filter
        };
        let page2 = list_executions(&db, &filter2).unwrap();
        assert_eq!(page2.len(), 2);
        assert_ne!(page1[0].id, page2[0].id);
    }

    #[test]
    fn export_execution_produces_json() {
        let db = temp_db();
        create_execution(&db, &sample_execution("exec-1")).unwrap();
        create_step(&db, &sample_step("step-1", "exec-1", 1)).unwrap();
        append_output(&db, "step-1", 0, r#"{"type":"system"}"#).unwrap();
        finish_step(&db, "step-1", "completed", Some(0), 100, 50).unwrap();
        finish_execution(&db, "exec-1", "completed").unwrap();

        let json_str = export_execution(&db, "exec-1").unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json_str).unwrap();
        assert_eq!(parsed["id"], "exec-1");
        assert_eq!(parsed["status"], "completed");
        assert!(parsed["steps"].is_array());
        assert_eq!(parsed["steps"][0]["outputs"][0]["type"], "system");
    }

    #[test]
    fn delete_execution_removes_all_related_data() {
        let db = temp_db();
        create_execution(&db, &sample_execution("exec-1")).unwrap();
        create_step(&db, &sample_step("step-1", "exec-1", 1)).unwrap();
        append_output(&db, "step-1", 0, r#"{"type":"system"}"#).unwrap();

        delete_execution(&db, "exec-1").unwrap();

        let filter = HistoryFilter {
            cwd: None,
            status: None,
            keyword: None,
            date_from: None,
            date_to: None,
            limit: 50,
            offset: 0,
        };
        let results = list_executions(&db, &filter).unwrap();
        assert!(results.is_empty());

        let outputs = get_step_outputs(&db, "step-1").unwrap();
        assert!(outputs.is_empty());
    }

    #[test]
    fn get_step_count_returns_correct_count() {
        let db = temp_db();
        create_execution(&db, &sample_execution("exec-1")).unwrap();
        create_step(&db, &sample_step("step-1", "exec-1", 1)).unwrap();
        create_step(&db, &sample_step("step-2", "exec-1", 2)).unwrap();

        let count = get_step_count(&db, "exec-1").unwrap();
        assert_eq!(count, 2);
    }

    #[test]
    fn execution_summary_serializes_correctly() {
        let summary = ExecutionSummary {
            id: "exec-1".to_string(),
            cwd: "/tmp/test".to_string(),
            cli_type: "claude-code".to_string(),
            status: "completed".to_string(),
            started_at: 1700000000000,
            finished_at: Some(1700000010000),
            step_count: 3,
            total_input_tokens: 500,
            total_output_tokens: 200,
        };
        let json = serde_json::to_value(&summary).unwrap();
        assert_eq!(json["id"], "exec-1");
        assert_eq!(json["cliType"], "claude-code");
        assert_eq!(json["stepCount"], 3);
        assert_eq!(json["totalInputTokens"], 500);
    }

}
