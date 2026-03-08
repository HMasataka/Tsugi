mod cli_adapter;
mod commands;
mod db;
mod flow;
mod history;
mod project;
mod session;
mod util;

use db::Database;
use flow::FlowStore;
use project::ProjectStore;
use session::SessionManager;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(SessionManager::new())
        .manage(ProjectStore::new())
        .manage(FlowStore::new())
        .invoke_handler(tauri::generate_handler![
            commands::start_session,
            commands::send_prompt,
            commands::abort_prompt,
            commands::stop_session,
            commands::stop_all_sessions,
            commands::list_sessions,
            commands::register_project,
            commands::unregister_project,
            commands::list_projects,
            commands::list_recent_dirs,
            commands::list_executions,
            commands::get_execution_detail,
            commands::get_step_outputs,
            commands::export_execution,
            commands::delete_execution,
            commands::write_export_file,
            commands::list_flows,
            commands::get_flow,
            commands::create_flow,
            commands::update_flow,
            commands::delete_flow,
            commands::import_flow,
            commands::export_flow,
        ])
        .setup(|app| {
            let app_handle = app.handle().clone();

            if cfg!(debug_assertions) {
                app_handle.plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Load persisted project data
            let project_store = app_handle.state::<ProjectStore>();
            if let Err(e) = project_store.load_blocking() {
                log::warn!("Failed to load project data: {}", e);
            }

            // Load persisted flow data
            let flow_store = app_handle.state::<FlowStore>();
            if let Err(e) = flow_store.load_blocking() {
                log::warn!("Failed to load flow data: {}", e);
            }

            // Initialize SQLite database
            let db_path = dirs::config_dir()
                .unwrap_or_else(|| std::path::PathBuf::from("."))
                .join("tsugi")
                .join("tsugi.db");

            let database = Database::open(db_path)
                .map_err(|e| format!("Failed to initialize database: {}", e))?;
            app_handle.manage(database);

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
