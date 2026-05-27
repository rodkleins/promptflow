#[tauri::command]
pub async fn start_voice_sync(_language: String) -> Result<(), String> {
    // TODO Phase 3: spawn whisper sidecar, start cpal audio capture
    Ok(())
}

#[tauri::command]
pub async fn stop_voice_sync() -> Result<(), String> {
    Ok(())
}
