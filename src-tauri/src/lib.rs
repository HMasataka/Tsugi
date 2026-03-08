mod cli_adapter;
mod commands;
mod project;
mod session;

use project::ProjectStore;
use session::SessionManager;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(SessionManager::new())
        .manage(ProjectStore::new())
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

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
