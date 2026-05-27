mod commands;
mod db;

use commands::{display, remote, voice_sync};
use tauri::{Manager, WindowEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:promptflow.db", db::migrations())
                .build(),
        )
        .manage(remote::RemoteServerHandle::new())
        .setup(|app| {
            remote::install_state_listener(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            display::list_displays,
            display::open_prompter_window,
            display::close_prompter_window,
            voice_sync::start_voice_sync,
            voice_sync::stop_voice_sync,
            remote::start_remote_server,
            remote::stop_remote_server,
            remote::broadcast_remote_state,
            remote::get_local_ip,
        ])
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { .. } = event {
                if window.label() == "main" {
                    if let Some(p) = window.app_handle().get_webview_window("prompter") {
                        let _ = p.close();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
