use crate::util;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum FlowStepType {
    Prompt,
    Condition,
    Loop,
    Validation,
    Approval,
}

fn default_step_type() -> FlowStepType {
    FlowStepType::Prompt
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlowStep {
    pub name: String,
    #[serde(default = "default_step_type")]
    pub step_type: FlowStepType,
    pub prompt: String,
    pub timeout_secs: Option<u32>,

    // condition
    pub condition_prompt: Option<String>,
    pub then_steps: Option<Vec<FlowStep>>,
    pub else_steps: Option<Vec<FlowStep>>,

    // loop
    pub loop_condition_prompt: Option<String>,
    pub max_iterations: Option<u32>,

    // validation
    pub validation_pattern: Option<String>,
    pub max_retries: Option<u32>,
    pub on_fail_steps: Option<Vec<FlowStep>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Flow {
    pub id: String,
    pub name: String,
    pub description: String,
    pub steps: Vec<FlowStep>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct FlowData {
    flows: Vec<Flow>,
}

pub struct FlowStore {
    data: Mutex<FlowData>,
    file_path: PathBuf,
}

impl FlowStore {
    pub fn new() -> Self {
        let config_dir = dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("tsugi");

        Self {
            data: Mutex::new(FlowData::default()),
            file_path: config_dir.join("flows.json"),
        }
    }

    pub fn load_blocking(&self) -> Result<(), String> {
        if !self.file_path.exists() {
            return Ok(());
        }
        let content = std::fs::read_to_string(&self.file_path)
            .map_err(|e| format!("Failed to read flows file: {}", e))?;
        let data: FlowData = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse flows file: {}", e))?;

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
            .map_err(|e| format!("Failed to serialize flows: {}", e))?;
        std::fs::write(&self.file_path, content)
            .map_err(|e| format!("Failed to write flows file: {}", e))?;

        Ok(())
    }

    pub fn list(&self) -> Result<Vec<Flow>, String> {
        let lock = self.data.lock().map_err(|e| e.to_string())?;
        Ok(lock.flows.clone())
    }

    pub fn get(&self, id: &str) -> Result<Flow, String> {
        let lock = self.data.lock().map_err(|e| e.to_string())?;
        lock.flows
            .iter()
            .find(|f| f.id == id)
            .cloned()
            .ok_or_else(|| format!("Flow not found: {}", id))
    }

    pub fn create(
        &self,
        name: String,
        description: String,
        steps: Vec<FlowStep>,
    ) -> Result<Flow, String> {
        let now = util::now_millis();
        let flow = Flow {
            id: util::generate_id(),
            name,
            description,
            steps,
            created_at: now,
            updated_at: now,
        };

        let mut lock = self.data.lock().map_err(|e| e.to_string())?;
        lock.flows.push(flow.clone());
        drop(lock);
        self.save()?;

        Ok(flow)
    }

    pub fn update(
        &self,
        id: &str,
        name: String,
        description: String,
        steps: Vec<FlowStep>,
    ) -> Result<Flow, String> {
        let mut lock = self.data.lock().map_err(|e| e.to_string())?;
        let flow = lock
            .flows
            .iter_mut()
            .find(|f| f.id == id)
            .ok_or_else(|| format!("Flow not found: {}", id))?;

        flow.name = name;
        flow.description = description;
        flow.steps = steps;
        flow.updated_at = util::now_millis();

        let updated = flow.clone();
        drop(lock);
        self.save()?;

        Ok(updated)
    }

    pub fn delete(&self, id: &str) -> Result<(), String> {
        let mut lock = self.data.lock().map_err(|e| e.to_string())?;
        let before = lock.flows.len();
        lock.flows.retain(|f| f.id != id);
        if lock.flows.len() == before {
            return Err(format!("Flow not found: {}", id));
        }
        drop(lock);
        self.save()?;
        Ok(())
    }

    pub fn import_flow(&self, json_str: &str) -> Result<Flow, String> {
        let imported: Flow = serde_json::from_str(json_str)
            .map_err(|e| format!("Failed to parse flow JSON: {}", e))?;

        let now = util::now_millis();
        let flow = Flow {
            id: util::generate_id(),
            name: imported.name,
            description: imported.description,
            steps: imported.steps,
            created_at: now,
            updated_at: now,
        };

        let mut lock = self.data.lock().map_err(|e| e.to_string())?;
        lock.flows.push(flow.clone());
        drop(lock);
        self.save()?;

        Ok(flow)
    }

    pub fn export_flow(&self, id: &str) -> Result<String, String> {
        let flow = self.get(id)?;
        serde_json::to_string_pretty(&flow)
            .map_err(|e| format!("Failed to serialize flow: {}", e))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn temp_store() -> FlowStore {
        let dir = std::env::temp_dir().join(format!("tsugi-flow-test-{}", util::generate_id()));
        fs::create_dir_all(&dir).unwrap();
        FlowStore {
            data: Mutex::new(FlowData::default()),
            file_path: dir.join("flows.json"),
        }
    }

    fn prompt_step(name: &str, prompt: &str, timeout_secs: Option<u32>) -> FlowStep {
        FlowStep {
            name: name.to_string(),
            step_type: FlowStepType::Prompt,
            prompt: prompt.to_string(),
            timeout_secs,
            condition_prompt: None,
            then_steps: None,
            else_steps: None,
            loop_condition_prompt: None,
            max_iterations: None,
            validation_pattern: None,
            max_retries: None,
            on_fail_steps: None,
        }
    }

    fn sample_steps() -> Vec<FlowStep> {
        vec![
            prompt_step("Review", "Review the code", Some(300)),
            prompt_step("Test", "Generate tests", None),
        ]
    }

    #[test]
    fn create_and_list_flows() {
        let store = temp_store();

        let flow = store
            .create(
                "Pipeline".to_string(),
                "A review pipeline".to_string(),
                sample_steps(),
            )
            .unwrap();

        assert_eq!(flow.name, "Pipeline");
        assert_eq!(flow.description, "A review pipeline");
        assert_eq!(flow.steps.len(), 2);

        let flows = store.list().unwrap();
        assert_eq!(flows.len(), 1);
        assert_eq!(flows[0].name, "Pipeline");
    }

    #[test]
    fn get_flow_by_id() {
        let store = temp_store();

        let created = store
            .create("Test".to_string(), "desc".to_string(), sample_steps())
            .unwrap();

        let fetched = store.get(&created.id).unwrap();
        assert_eq!(fetched.id, created.id);
        assert_eq!(fetched.name, "Test");
    }

    #[test]
    fn get_nonexistent_flow_fails() {
        let store = temp_store();
        let result = store.get("nonexistent");
        assert!(result.is_err());
    }

    #[test]
    fn update_flow() {
        let store = temp_store();

        let created = store
            .create("Original".to_string(), "desc".to_string(), sample_steps())
            .unwrap();

        let updated = store
            .update(
                &created.id,
                "Updated".to_string(),
                "new desc".to_string(),
                vec![prompt_step("Single", "Do something", None)],
            )
            .unwrap();

        assert_eq!(updated.name, "Updated");
        assert_eq!(updated.description, "new desc");
        assert_eq!(updated.steps.len(), 1);
        assert!(updated.updated_at >= created.updated_at);
    }

    #[test]
    fn update_nonexistent_flow_fails() {
        let store = temp_store();
        let result = store.update(
            "nonexistent",
            "name".to_string(),
            "desc".to_string(),
            vec![],
        );
        assert!(result.is_err());
    }

    #[test]
    fn delete_flow() {
        let store = temp_store();

        let flow = store
            .create("ToDelete".to_string(), "desc".to_string(), sample_steps())
            .unwrap();

        store.delete(&flow.id).unwrap();

        let flows = store.list().unwrap();
        assert!(flows.is_empty());
    }

    #[test]
    fn delete_nonexistent_flow_fails() {
        let store = temp_store();
        let result = store.delete("nonexistent");
        assert!(result.is_err());
    }

    #[test]
    fn import_and_export_flow() {
        let store = temp_store();

        let original = store
            .create("Export Me".to_string(), "desc".to_string(), sample_steps())
            .unwrap();

        let json = store.export_flow(&original.id).unwrap();

        let imported = store.import_flow(&json).unwrap();

        // Imported flow gets a new ID
        assert_ne!(imported.id, original.id);
        assert_eq!(imported.name, original.name);
        assert_eq!(imported.description, original.description);
        assert_eq!(imported.steps.len(), original.steps.len());

        let flows = store.list().unwrap();
        assert_eq!(flows.len(), 2);
    }

    #[test]
    fn import_invalid_json_fails() {
        let store = temp_store();
        let result = store.import_flow("not valid json");
        assert!(result.is_err());
    }

    #[test]
    fn persistence_roundtrip() {
        let store = temp_store();
        let file_path = store.file_path.clone();

        store
            .create("Persist".to_string(), "desc".to_string(), sample_steps())
            .unwrap();

        let store2 = FlowStore {
            data: Mutex::new(FlowData::default()),
            file_path,
        };
        store2.load_blocking().unwrap();

        let flows = store2.list().unwrap();
        assert_eq!(flows.len(), 1);
        assert_eq!(flows[0].name, "Persist");
        assert_eq!(flows[0].steps.len(), 2);
    }

    #[test]
    fn flow_serializes_correctly() {
        let flow = Flow {
            id: "test-id".to_string(),
            name: "Test Flow".to_string(),
            description: "A test flow".to_string(),
            steps: vec![prompt_step("Step 1", "Do this", Some(60))],
            created_at: 1700000000000,
            updated_at: 1700000000000,
        };
        let json = serde_json::to_value(&flow).unwrap();
        assert_eq!(json["id"], "test-id");
        assert_eq!(json["name"], "Test Flow");
        assert_eq!(json["description"], "A test flow");
        assert_eq!(json["steps"][0]["name"], "Step 1");
        assert_eq!(json["steps"][0]["prompt"], "Do this");
        assert_eq!(json["steps"][0]["timeoutSecs"], 60);
        assert_eq!(json["createdAt"], 1700000000000i64);
        assert_eq!(json["updatedAt"], 1700000000000i64);
    }

    #[test]
    fn flow_step_without_timeout() {
        let step = prompt_step("No timeout", "prompt", None);
        let json = serde_json::to_value(&step).unwrap();
        assert_eq!(json["name"], "No timeout");
        assert!(json["timeoutSecs"].is_null());
    }

    #[test]
    fn step_type_defaults_to_prompt() {
        let json_str = r#"{"name":"Legacy","prompt":"do it","timeoutSecs":null}"#;
        let step: FlowStep = serde_json::from_str(json_str).unwrap();
        assert_eq!(step.step_type, FlowStepType::Prompt);
    }

    #[test]
    fn step_type_serializes_correctly() {
        let step = FlowStep {
            name: "Check".to_string(),
            step_type: FlowStepType::Condition,
            prompt: String::new(),
            timeout_secs: None,
            condition_prompt: Some("Is it good?".to_string()),
            then_steps: Some(vec![prompt_step("Yes path", "do yes", None)]),
            else_steps: Some(vec![prompt_step("No path", "do no", None)]),
            loop_condition_prompt: None,
            max_iterations: None,
            validation_pattern: None,
            max_retries: None,
            on_fail_steps: None,
        };
        let json = serde_json::to_value(&step).unwrap();
        assert_eq!(json["stepType"], "condition");
        assert_eq!(json["conditionPrompt"], "Is it good?");
        assert_eq!(json["thenSteps"][0]["name"], "Yes path");
        assert_eq!(json["elseSteps"][0]["name"], "No path");
    }

    #[test]
    fn loop_step_serializes_correctly() {
        let step = FlowStep {
            name: "Repeat".to_string(),
            step_type: FlowStepType::Loop,
            prompt: "Try again".to_string(),
            timeout_secs: None,
            condition_prompt: None,
            then_steps: None,
            else_steps: None,
            loop_condition_prompt: Some("Is it done?".to_string()),
            max_iterations: Some(5),
            validation_pattern: None,
            max_retries: None,
            on_fail_steps: None,
        };
        let json = serde_json::to_value(&step).unwrap();
        assert_eq!(json["stepType"], "loop");
        assert_eq!(json["loopConditionPrompt"], "Is it done?");
        assert_eq!(json["maxIterations"], 5);
    }

    #[test]
    fn validation_step_serializes_correctly() {
        let step = FlowStep {
            name: "Validate".to_string(),
            step_type: FlowStepType::Validation,
            prompt: "Generate JSON".to_string(),
            timeout_secs: None,
            condition_prompt: None,
            then_steps: None,
            else_steps: None,
            loop_condition_prompt: None,
            max_iterations: None,
            validation_pattern: Some(r"^\{.*\}$".to_string()),
            max_retries: Some(3),
            on_fail_steps: None,
        };
        let json = serde_json::to_value(&step).unwrap();
        assert_eq!(json["stepType"], "validation");
        assert_eq!(json["validationPattern"], r"^\{.*\}$");
        assert_eq!(json["maxRetries"], 3);
    }

    #[test]
    fn approval_step_serializes_correctly() {
        let step = FlowStep {
            name: "Review gate".to_string(),
            step_type: FlowStepType::Approval,
            prompt: String::new(),
            timeout_secs: None,
            condition_prompt: None,
            then_steps: None,
            else_steps: None,
            loop_condition_prompt: None,
            max_iterations: None,
            validation_pattern: None,
            max_retries: None,
            on_fail_steps: None,
        };
        let json = serde_json::to_value(&step).unwrap();
        assert_eq!(json["stepType"], "approval");
    }

    #[test]
    fn backward_compatible_flow_json_deserializes() {
        let json_str = r#"{
            "id": "old-flow",
            "name": "Legacy Flow",
            "description": "Before v0.8",
            "steps": [
                {"name": "Step 1", "prompt": "Do this", "timeoutSecs": 60}
            ],
            "createdAt": 1700000000000,
            "updatedAt": 1700000000000
        }"#;
        let flow: Flow = serde_json::from_str(json_str).unwrap();
        assert_eq!(flow.steps[0].step_type, FlowStepType::Prompt);
        assert!(flow.steps[0].condition_prompt.is_none());
    }

    #[test]
    fn load_nonexistent_file_is_ok() {
        let store = FlowStore {
            data: Mutex::new(FlowData::default()),
            file_path: PathBuf::from("/tmp/nonexistent-tsugi-test/flows.json"),
        };
        let result = store.load_blocking();
        assert!(result.is_ok());
    }
}
