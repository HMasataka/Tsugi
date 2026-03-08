use crate::cli_adapter::{CliAdapter, ClaudeCodeAdapter};
use crate::flow::{FlowStep, FlowStepType};
use crate::session::CliType;
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::ipc::Channel;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::sync::{oneshot, Mutex};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase", rename_all_fields = "camelCase", tag = "event", content = "data")]
pub enum FlowExecutionEvent {
    StepStarted {
        step_name: String,
        step_type: String,
        step_index: usize,
    },
    StepCompleted {
        step_name: String,
        output: String,
    },
    StepFailed {
        step_name: String,
        error: String,
    },
    ConditionEvaluated {
        step_name: String,
        result: bool,
    },
    LoopIteration {
        step_name: String,
        iteration: u32,
    },
    ValidationResult {
        step_name: String,
        passed: bool,
        pattern: String,
    },
    ApprovalRequired {
        step_name: String,
        step_index: usize,
    },
    FlowCompleted,
    FlowFailed {
        error: String,
    },
}

pub enum StepResult {
    Completed { output: String },
    Failed { error: String },
}

pub struct FlowContext {
    pub cwd: PathBuf,
    pub cli_type: CliType,
    pub session_id: Option<String>,
    pub last_output: String,
    pub on_event: Channel<FlowExecutionEvent>,
    pub step_counter: usize,
}

pub struct FlowExecution {
    pub approval_sender: Option<oneshot::Sender<bool>>,
}

pub struct FlowExecutionManager {
    pub executions: Mutex<HashMap<String, FlowExecution>>,
}

impl FlowExecutionManager {
    pub fn new() -> Self {
        Self {
            executions: Mutex::new(HashMap::new()),
        }
    }
}

pub struct FlowRunner;

impl FlowRunner {
    pub async fn execute_flow(
        steps: &[FlowStep],
        cwd: &Path,
        cli_type: &CliType,
        session_id: Option<&str>,
        on_event: &Channel<FlowExecutionEvent>,
        execution_id: &str,
        execution_manager: &Arc<FlowExecutionManager>,
    ) -> Result<(), String> {
        let mut context = FlowContext {
            cwd: cwd.to_path_buf(),
            cli_type: cli_type.clone(),
            session_id: session_id.map(|s| s.to_string()),
            last_output: String::new(),
            on_event: on_event.clone(),
            step_counter: 0,
        };

        for step in steps {
            let result = Self::execute_step(
                step,
                &mut context,
                execution_id,
                execution_manager,
            )
            .await;

            match result {
                Ok(StepResult::Completed { output }) => {
                    context.last_output = output;
                }
                Ok(StepResult::Failed { error }) => {
                    let _ = on_event.send(FlowExecutionEvent::FlowFailed {
                        error: error.clone(),
                    });
                    return Err(error);
                }
                Err(e) => {
                    let _ = on_event.send(FlowExecutionEvent::FlowFailed {
                        error: e.clone(),
                    });
                    return Err(e);
                }
            }
        }

        let _ = on_event.send(FlowExecutionEvent::FlowCompleted);
        Ok(())
    }

    fn execute_step<'a>(
        step: &'a FlowStep,
        context: &'a mut FlowContext,
        execution_id: &'a str,
        execution_manager: &'a Arc<FlowExecutionManager>,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<StepResult, String>> + Send + 'a>> {
        Box::pin(async move {
        let step_index = context.step_counter;
        context.step_counter += 1;

        let step_type_str = match step.step_type {
            FlowStepType::Prompt => "prompt",
            FlowStepType::Condition => "condition",
            FlowStepType::Loop => "loop",
            FlowStepType::Validation => "validation",
            FlowStepType::Approval => "approval",
        };

        let _ = context.on_event.send(FlowExecutionEvent::StepStarted {
            step_name: step.name.clone(),
            step_type: step_type_str.to_string(),
            step_index,
        });

        let result = match step.step_type {
            FlowStepType::Prompt => Self::execute_prompt_step(step, context).await,
            FlowStepType::Approval => {
                Self::execute_approval_step(
                    step,
                    context,
                    step_index,
                    execution_id,
                    execution_manager,
                )
                .await
            }
            FlowStepType::Condition => {
                Self::execute_condition_step(step, context, execution_id, execution_manager).await
            }
            FlowStepType::Loop => {
                Self::execute_loop_step(step, context, execution_id, execution_manager).await
            }
            FlowStepType::Validation => {
                Self::execute_validation_step(step, context, execution_id, execution_manager).await
            }
        };

        match &result {
            Ok(StepResult::Completed { output }) => {
                let _ = context.on_event.send(FlowExecutionEvent::StepCompleted {
                    step_name: step.name.clone(),
                    output: output.clone(),
                });
            }
            Ok(StepResult::Failed { error }) => {
                let _ = context.on_event.send(FlowExecutionEvent::StepFailed {
                    step_name: step.name.clone(),
                    error: error.clone(),
                });
            }
            Err(e) => {
                let _ = context.on_event.send(FlowExecutionEvent::StepFailed {
                    step_name: step.name.clone(),
                    error: e.clone(),
                });
            }
        }

        result
        })
    }

    async fn execute_prompt_step(
        step: &FlowStep,
        context: &mut FlowContext,
    ) -> Result<StepResult, String> {
        let output = Self::run_cli_prompt(
            &step.prompt,
            &context.cwd,
            &context.cli_type,
            context.session_id.as_deref(),
        )
        .await?;

        Ok(StepResult::Completed { output })
    }

    async fn execute_approval_step(
        step: &FlowStep,
        context: &mut FlowContext,
        step_index: usize,
        execution_id: &str,
        execution_manager: &Arc<FlowExecutionManager>,
    ) -> Result<StepResult, String> {
        let (tx, rx) = oneshot::channel();

        {
            let mut executions = execution_manager.executions.lock().await;
            if let Some(execution) = executions.get_mut(execution_id) {
                execution.approval_sender = Some(tx);
            } else {
                return Ok(StepResult::Failed {
                    error: "Execution not found".to_string(),
                });
            }
        }

        let _ = context.on_event.send(FlowExecutionEvent::ApprovalRequired {
            step_name: step.name.clone(),
            step_index,
        });

        let approved = rx.await.map_err(|_| "Approval channel closed".to_string())?;

        if approved {
            Ok(StepResult::Completed {
                output: "Approved".to_string(),
            })
        } else {
            Ok(StepResult::Failed {
                error: "Rejected by user".to_string(),
            })
        }
    }

    async fn execute_condition_step(
        step: &FlowStep,
        context: &mut FlowContext,
        execution_id: &str,
        execution_manager: &Arc<FlowExecutionManager>,
    ) -> Result<StepResult, String> {
        let condition_prompt = step
            .condition_prompt
            .as_deref()
            .ok_or("Condition step missing conditionPrompt")?;

        let result =
            Self::evaluate_condition(condition_prompt, &context.last_output, &context.cwd, &context.cli_type).await?;

        let _ = context.on_event.send(FlowExecutionEvent::ConditionEvaluated {
            step_name: step.name.clone(),
            result,
        });

        let branch_steps = if result {
            step.then_steps.as_deref()
        } else {
            step.else_steps.as_deref()
        };

        if let Some(steps) = branch_steps {
            for sub_step in steps {
                let sub_result = Self::execute_step(
                    sub_step,
                    context,
                    execution_id,
                    execution_manager,
                )
                .await?;
                match sub_result {
                    StepResult::Completed { output } => {
                        context.last_output = output;
                    }
                    StepResult::Failed { .. } => return Ok(sub_result),
                }
            }
        }

        Ok(StepResult::Completed {
            output: context.last_output.clone(),
        })
    }

    async fn execute_loop_step(
        step: &FlowStep,
        context: &mut FlowContext,
        _execution_id: &str,
        _execution_manager: &Arc<FlowExecutionManager>,
    ) -> Result<StepResult, String> {
        let loop_condition = step
            .loop_condition_prompt
            .as_deref()
            .ok_or("Loop step missing loopConditionPrompt")?;

        let max_iter = step.max_iterations.unwrap_or(10);

        for iteration in 0..max_iter {
            let _ = context.on_event.send(FlowExecutionEvent::LoopIteration {
                step_name: step.name.clone(),
                iteration,
            });

            let output = Self::run_cli_prompt(
                &step.prompt,
                &context.cwd,
                &context.cli_type,
                context.session_id.as_deref(),
            )
            .await?;

            context.last_output = output;

            let should_continue =
                Self::evaluate_condition(loop_condition, &context.last_output, &context.cwd, &context.cli_type)
                    .await?;

            if !should_continue {
                break;
            }
        }

        Ok(StepResult::Completed {
            output: context.last_output.clone(),
        })
    }

    async fn execute_validation_step(
        step: &FlowStep,
        context: &mut FlowContext,
        execution_id: &str,
        execution_manager: &Arc<FlowExecutionManager>,
    ) -> Result<StepResult, String> {
        let pattern_str = step
            .validation_pattern
            .as_deref()
            .ok_or("Validation step missing validationPattern")?;

        let regex = regex_lite::Regex::new(pattern_str)
            .map_err(|e| format!("Invalid validation pattern: {}", e))?;

        let max_retries = step.max_retries.unwrap_or(3);

        for attempt in 0..=max_retries {
            let output = Self::run_cli_prompt(
                &step.prompt,
                &context.cwd,
                &context.cli_type,
                context.session_id.as_deref(),
            )
            .await?;

            let passed = regex.is_match(&output);

            let _ = context.on_event.send(FlowExecutionEvent::ValidationResult {
                step_name: step.name.clone(),
                passed,
                pattern: pattern_str.to_string(),
            });

            if passed {
                context.last_output = output;
                return Ok(StepResult::Completed {
                    output: context.last_output.clone(),
                });
            }

            context.last_output = output;

            if attempt == max_retries {
                // Exhausted retries, run on_fail_steps if defined
                if let Some(fail_steps) = &step.on_fail_steps {
                    for sub_step in fail_steps {
                        let sub_result = Self::execute_step(
                            sub_step,
                            context,
                            execution_id,
                            execution_manager,
                        )
                        .await?;
                        match sub_result {
                            StepResult::Completed { output } => {
                                context.last_output = output;
                            }
                            StepResult::Failed { .. } => return Ok(sub_result),
                        }
                    }
                    return Ok(StepResult::Completed {
                        output: context.last_output.clone(),
                    });
                }

                return Ok(StepResult::Failed {
                    error: format!(
                        "Validation failed after {} retries for pattern: {}",
                        max_retries, pattern_str,
                    ),
                });
            }
        }

        unreachable!("loop always returns within 0..=max_retries range")
    }

    async fn evaluate_condition(
        condition_prompt: &str,
        previous_output: &str,
        cwd: &Path,
        cli_type: &CliType,
    ) -> Result<bool, String> {
        let full_prompt = format!(
            "以下は前のステップの出力です:\n---\n{}\n---\n\n{}\n\n回答は必ず「yes」または「no」の一単語のみで答えてください。",
            previous_output, condition_prompt
        );

        let output = Self::run_cli_prompt(&full_prompt, cwd, cli_type, None).await?;

        let trimmed = output.trim().to_lowercase();
        Ok(trimmed == "yes" || trimmed == "true" || trimmed == "1")
    }

    async fn run_cli_prompt(
        prompt: &str,
        cwd: &Path,
        cli_type: &CliType,
        session_id: Option<&str>,
    ) -> Result<String, String> {
        let adapter: Box<dyn CliAdapter> = match cli_type {
            CliType::ClaudeCode => Box::new(ClaudeCodeAdapter),
            CliType::Codex => return Err("Codex adapter is not implemented".to_string()),
        };

        let mut cmd = adapter.build_command(prompt, cwd, session_id);
        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Failed to spawn process: {}", e))?;

        let stdout = child
            .stdout
            .take()
            .ok_or("Failed to capture stdout")?;

        let mut reader = BufReader::new(stdout).lines();
        let mut output_text = String::new();

        while let Ok(Some(line)) = reader.next_line().await {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&line) {
                if let Some(text) = extract_output_text(&json) {
                    output_text.push_str(&text);
                }
            }
        }

        let status = child
            .wait()
            .await
            .map_err(|e| format!("Failed to wait for process: {}", e))?;

        if !status.success() {
            return Err(format!(
                "Process exited with code: {:?}",
                status.code()
            ));
        }

        Ok(output_text)
    }
}

fn extract_output_text(json: &serde_json::Value) -> Option<String> {
    // Extract text content from stream-json output
    let msg_type = json.get("type")?.as_str()?;
    if msg_type == "assistant" {
        if let Some(content) = json.get("content") {
            if let Some(arr) = content.as_array() {
                let mut text = String::new();
                for item in arr {
                    if item.get("type")?.as_str()? == "text" {
                        if let Some(t) = item.get("text").and_then(|v| v.as_str()) {
                            text.push_str(t);
                        }
                    }
                }
                return Some(text);
            }
        }
    }
    // Also handle result messages
    if msg_type == "result" {
        if let Some(result_text) = json.get("result").and_then(|v| v.as_str()) {
            return Some(result_text.to_string());
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flow_execution_event_step_started_serializes() {
        let event = FlowExecutionEvent::StepStarted {
            step_name: "Build".to_string(),
            step_type: "prompt".to_string(),
            step_index: 0,
        };
        let json = serde_json::to_value(&event).unwrap();
        assert_eq!(json["event"], "stepStarted");
        assert_eq!(json["data"]["stepName"], "Build");
        assert_eq!(json["data"]["stepType"], "prompt");
        assert_eq!(json["data"]["stepIndex"], 0);
    }

    #[test]
    fn flow_execution_event_step_completed_serializes() {
        let event = FlowExecutionEvent::StepCompleted {
            step_name: "Build".to_string(),
            output: "done".to_string(),
        };
        let json = serde_json::to_value(&event).unwrap();
        assert_eq!(json["event"], "stepCompleted");
        assert_eq!(json["data"]["stepName"], "Build");
        assert_eq!(json["data"]["output"], "done");
    }

    #[test]
    fn flow_execution_event_step_failed_serializes() {
        let event = FlowExecutionEvent::StepFailed {
            step_name: "Build".to_string(),
            error: "compile error".to_string(),
        };
        let json = serde_json::to_value(&event).unwrap();
        assert_eq!(json["event"], "stepFailed");
        assert_eq!(json["data"]["error"], "compile error");
    }

    #[test]
    fn flow_execution_event_condition_evaluated_serializes() {
        let event = FlowExecutionEvent::ConditionEvaluated {
            step_name: "Check".to_string(),
            result: true,
        };
        let json = serde_json::to_value(&event).unwrap();
        assert_eq!(json["event"], "conditionEvaluated");
        assert_eq!(json["data"]["result"], true);
    }

    #[test]
    fn flow_execution_event_loop_iteration_serializes() {
        let event = FlowExecutionEvent::LoopIteration {
            step_name: "Retry".to_string(),
            iteration: 3,
        };
        let json = serde_json::to_value(&event).unwrap();
        assert_eq!(json["event"], "loopIteration");
        assert_eq!(json["data"]["iteration"], 3);
    }

    #[test]
    fn flow_execution_event_validation_result_serializes() {
        let event = FlowExecutionEvent::ValidationResult {
            step_name: "Validate".to_string(),
            passed: false,
            pattern: r"^\d+$".to_string(),
        };
        let json = serde_json::to_value(&event).unwrap();
        assert_eq!(json["event"], "validationResult");
        assert_eq!(json["data"]["passed"], false);
    }

    #[test]
    fn flow_execution_event_approval_required_serializes() {
        let event = FlowExecutionEvent::ApprovalRequired {
            step_name: "Review".to_string(),
            step_index: 2,
        };
        let json = serde_json::to_value(&event).unwrap();
        assert_eq!(json["event"], "approvalRequired");
        assert_eq!(json["data"]["stepIndex"], 2);
    }

    #[test]
    fn flow_execution_event_flow_completed_serializes() {
        let event = FlowExecutionEvent::FlowCompleted;
        let json = serde_json::to_value(&event).unwrap();
        assert_eq!(json["event"], "flowCompleted");
    }

    #[test]
    fn flow_execution_event_flow_failed_serializes() {
        let event = FlowExecutionEvent::FlowFailed {
            error: "fatal".to_string(),
        };
        let json = serde_json::to_value(&event).unwrap();
        assert_eq!(json["event"], "flowFailed");
        assert_eq!(json["data"]["error"], "fatal");
    }

    #[test]
    fn extract_output_text_from_assistant_message() {
        let json: serde_json::Value = serde_json::from_str(
            r#"{"type":"assistant","content":[{"type":"text","text":"hello world"}]}"#,
        )
        .unwrap();
        assert_eq!(extract_output_text(&json), Some("hello world".to_string()));
    }

    #[test]
    fn extract_output_text_from_result_message() {
        let json: serde_json::Value =
            serde_json::from_str(r#"{"type":"result","result":"final output"}"#).unwrap();
        assert_eq!(
            extract_output_text(&json),
            Some("final output".to_string())
        );
    }

    #[test]
    fn extract_output_text_returns_none_for_system_message() {
        let json: serde_json::Value =
            serde_json::from_str(r#"{"type":"system","subtype":"init"}"#).unwrap();
        assert_eq!(extract_output_text(&json), None);
    }

    #[test]
    fn flow_execution_manager_starts_empty() {
        let manager = FlowExecutionManager::new();
        let executions = manager.executions.blocking_lock();
        assert!(executions.is_empty());
    }

    #[tokio::test]
    async fn approval_flow_approved() {
        let manager = Arc::new(FlowExecutionManager::new());
        let execution_id = "test-exec";
        {
            let mut executions = manager.executions.lock().await;
            executions.insert(
                execution_id.to_string(),
                FlowExecution {
                    approval_sender: None,
                },
            );
        }

        let (tx, rx) = oneshot::channel();
        {
            let mut executions = manager.executions.lock().await;
            executions
                .get_mut(execution_id)
                .unwrap()
                .approval_sender = Some(tx);
        }

        // Simulate approval
        let handle = tokio::spawn(async move {
            rx.await.unwrap()
        });

        {
            let mut executions = manager.executions.lock().await;
            if let Some(execution) = executions.get_mut(execution_id) {
                if let Some(sender) = execution.approval_sender.take() {
                    sender.send(true).unwrap();
                }
            }
        }

        let result = handle.await.unwrap();
        assert!(result);
    }

    #[tokio::test]
    async fn approval_flow_rejected() {
        let manager = Arc::new(FlowExecutionManager::new());
        let execution_id = "test-exec-reject";
        {
            let mut executions = manager.executions.lock().await;
            executions.insert(
                execution_id.to_string(),
                FlowExecution {
                    approval_sender: None,
                },
            );
        }

        let (tx, rx) = oneshot::channel();
        {
            let mut executions = manager.executions.lock().await;
            executions
                .get_mut(execution_id)
                .unwrap()
                .approval_sender = Some(tx);
        }

        let handle = tokio::spawn(async move {
            rx.await.unwrap()
        });

        {
            let mut executions = manager.executions.lock().await;
            if let Some(execution) = executions.get_mut(execution_id) {
                if let Some(sender) = execution.approval_sender.take() {
                    sender.send(false).unwrap();
                }
            }
        }

        let result = handle.await.unwrap();
        assert!(!result);
    }
}
