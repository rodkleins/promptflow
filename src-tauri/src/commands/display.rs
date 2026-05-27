use serde::Serialize;
use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, WebviewUrl, WebviewWindowBuilder};

const PROMPTER_LABEL: &str = "prompter";

#[derive(Serialize)]
pub struct DisplayInfo {
    pub id: u32,
    pub label: String,
    pub width: u32,
    pub height: u32,
    pub x: i32,
    pub y: i32,
    pub scale_factor: f64,
    pub is_primary: bool,
}

#[tauri::command]
pub async fn list_displays(app: AppHandle) -> Result<Vec<DisplayInfo>, String> {
    let monitors = app.available_monitors().map_err(|e| e.to_string())?;
    let primary = app.primary_monitor().map_err(|e| e.to_string())?;
    let primary_name = primary.as_ref().and_then(|m| m.name().cloned());

    Ok(monitors
        .into_iter()
        .enumerate()
        .map(|(idx, m)| {
            let size = m.size();
            let pos = m.position();
            let name = m.name().cloned();
            let scale = m.scale_factor();
            // Primary detection: name match if available, else position at (0,0)
            let is_primary = match (&name, &primary_name) {
                (Some(n), Some(p)) => n == p,
                _ => pos.x == 0 && pos.y == 0,
            };
            DisplayInfo {
                id: idx as u32,
                label: name.unwrap_or_else(|| format!("Display {}", idx + 1)),
                width: size.width,
                height: size.height,
                x: pos.x,
                y: pos.y,
                scale_factor: scale,
                is_primary,
            }
        })
        .collect())
}

#[tauri::command]
pub async fn open_prompter_window(
    app: AppHandle,
    display_id: u32,
    script_id: String,
) -> Result<(), String> {
    if let Some(existing) = app.get_webview_window(PROMPTER_LABEL) {
        existing.close().map_err(|e| e.to_string())?;
    }

    let monitors = app.available_monitors().map_err(|e| e.to_string())?;
    let target = monitors
        .get(display_id as usize)
        .ok_or_else(|| format!("Display {} not found", display_id))?;

    let scale = target.scale_factor();
    // Tauri's builder uses logical coordinates by default — convert from physical.
    let px = target.position().x as f64 / scale;
    let py = target.position().y as f64 / scale;
    let pw = target.size().width as f64 / scale;
    let ph = target.size().height as f64 / scale;

    eprintln!(
        "[promptflow] opening prompter on display {} at logical ({:.0},{:.0}) {:.0}x{:.0} scale={}",
        display_id, px, py, pw, ph, scale
    );

    let url = format!("index.html?prompter=1&scriptId={}", script_id);
    let window = WebviewWindowBuilder::new(&app, PROMPTER_LABEL, WebviewUrl::App(url.into()))
        .title("PromptFlow Prompter")
        .decorations(false)
        .always_on_top(true)
        .resizable(false)
        .position(px, py)
        .inner_size(pw, ph)
        .visible(false)
        .build()
        .map_err(|e| e.to_string())?;

    // Re-assert position/size after build (defensive — some platforms reset).
    window
        .set_position(LogicalPosition::new(px, py))
        .map_err(|e| e.to_string())?;
    window
        .set_size(LogicalSize::new(pw, ph))
        .map_err(|e| e.to_string())?;
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn close_prompter_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(PROMPTER_LABEL) {
        window.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}
