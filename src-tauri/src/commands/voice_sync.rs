use std::{
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
};

use cpal::{
    SampleFormat,
    traits::{DeviceTrait, HostTrait, StreamTrait},
};
use futures_util::StreamExt;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State as TauriState};
use tauri_plugin_shell::ShellExt;
use tokio::{
    io::AsyncWriteExt,
    sync::{Mutex, mpsc, oneshot},
};

const SAMPLE_RATE: u32 = 16_000;
const CHUNK_SECONDS: usize = 3;
const CHUNK_SAMPLES: usize = SAMPLE_RATE as usize * CHUNK_SECONDS;
const WAV_QUEUE_DEPTH: usize = 8;

#[derive(Clone, Serialize)]
struct DownloadProgress {
    name: String,
    downloaded: u64,
    total: u64,
}

#[derive(Clone, Serialize)]
pub struct ModelStatus {
    name: String,
    present: bool,
    bytes: u64,
    path: String,
}

#[derive(Clone, Serialize)]
struct Transcript {
    text: String,
}

pub struct VoiceSyncHandle {
    inner: Mutex<Option<RunningSession>>,
}

impl VoiceSyncHandle {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(None),
        }
    }
}

struct RunningSession {
    stop_flag: Arc<AtomicBool>,
    shutdown: oneshot::Sender<()>,
}

// -- Path helpers ------------------------------------------------------------

fn models_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app data dir unavailable: {e}"))?
        .join("models");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn model_path(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    Ok(models_dir(app)?.join(format!("ggml-{name}.bin")))
}

fn validate_model_name(name: &str) -> Result<(), String> {
    match name {
        "tiny" | "base" => Ok(()),
        other => Err(format!("unsupported whisper model: {other}")),
    }
}

// -- Commands: model storage -------------------------------------------------

#[tauri::command]
pub async fn check_whisper_model(app: AppHandle, name: String) -> Result<ModelStatus, String> {
    validate_model_name(&name)?;
    let path = model_path(&app, &name)?;
    let (present, bytes) = match std::fs::metadata(&path) {
        Ok(meta) => (meta.is_file(), meta.len()),
        Err(_) => (false, 0),
    };
    Ok(ModelStatus {
        name,
        present,
        bytes,
        path: path.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
pub async fn download_whisper_model(app: AppHandle, name: String) -> Result<ModelStatus, String> {
    validate_model_name(&name)?;
    let dest = model_path(&app, &name)?;
    let url = format!(
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-{name}.bin"
    );

    let resp = reqwest::get(&url)
        .await
        .map_err(|e| format!("download request failed: {e}"))?
        .error_for_status()
        .map_err(|e| format!("download response: {e}"))?;

    let total = resp.content_length().unwrap_or(0);
    let partial = dest.with_extension("bin.partial");
    let mut file = tokio::fs::File::create(&partial)
        .await
        .map_err(|e| e.to_string())?;

    let mut stream = resp.bytes_stream();
    let mut downloaded: u64 = 0;
    let mut next_emit: u64 = 0;
    while let Some(chunk) = stream.next().await {
        let bytes = chunk.map_err(|e| format!("download stream: {e}"))?;
        file.write_all(&bytes).await.map_err(|e| e.to_string())?;
        downloaded += bytes.len() as u64;
        // Throttle: emit roughly every 256 KB to avoid event spam.
        if downloaded >= next_emit {
            let _ = app.emit(
                "voice:download-progress",
                DownloadProgress {
                    name: name.clone(),
                    downloaded,
                    total,
                },
            );
            next_emit = downloaded + 256 * 1024;
        }
    }
    file.flush().await.map_err(|e| e.to_string())?;
    drop(file);
    tokio::fs::rename(&partial, &dest)
        .await
        .map_err(|e| format!("rename: {e}"))?;

    let _ = app.emit(
        "voice:download-progress",
        DownloadProgress {
            name: name.clone(),
            downloaded,
            total: downloaded,
        },
    );

    check_whisper_model(app, name).await
}

// -- Commands: session lifecycle --------------------------------------------

#[tauri::command]
pub async fn start_voice_sync(
    app: AppHandle,
    handle: TauriState<'_, VoiceSyncHandle>,
    language: String,
    model: String,
) -> Result<(), String> {
    validate_model_name(&model)?;
    let model_file = model_path(&app, &model)?;
    if !model_file.exists() {
        return Err(format!(
            "whisper model '{model}' not downloaded — call download_whisper_model first"
        ));
    }

    let mut guard = handle.inner.lock().await;
    if guard.is_some() {
        return Ok(()); // idempotent
    }

    let stop_flag = Arc::new(AtomicBool::new(false));
    let (wav_tx, wav_rx) = mpsc::channel::<Vec<u8>>(WAV_QUEUE_DEPTH);

    // Audio capture lives on a dedicated thread because cpal::Stream is !Send.
    let capture_stop = Arc::clone(&stop_flag);
    let _capture_thread = std::thread::Builder::new()
        .name("promptflow-voice-capture".into())
        .spawn(move || {
            if let Err(e) = run_capture(wav_tx, capture_stop) {
                eprintln!("[voice_sync] capture exited: {e}");
            }
        })
        .map_err(|e| format!("spawn capture thread: {e}"))?;

    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();

    let worker_app = app.clone();
    let worker_stop = Arc::clone(&stop_flag);
    tokio::spawn(async move {
        run_worker(worker_app, wav_rx, model_file, language, shutdown_rx).await;
        worker_stop.store(true, Ordering::Relaxed);
    });

    *guard = Some(RunningSession {
        stop_flag,
        shutdown: shutdown_tx,
    });
    Ok(())
}

#[tauri::command]
pub async fn stop_voice_sync(handle: TauriState<'_, VoiceSyncHandle>) -> Result<(), String> {
    let mut guard = handle.inner.lock().await;
    if let Some(session) = guard.take() {
        session.stop_flag.store(true, Ordering::Relaxed);
        let _ = session.shutdown.send(());
    }
    Ok(())
}

// -- Audio capture -----------------------------------------------------------

fn run_capture(wav_tx: mpsc::Sender<Vec<u8>>, stop: Arc<AtomicBool>) -> Result<(), String> {
    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or_else(|| "no default audio input device".to_string())?;
    let config = device
        .default_input_config()
        .map_err(|e| format!("default input config: {e}"))?;
    let sample_rate = config.sample_rate().0;
    let channels = config.channels() as usize;
    let sample_format = config.sample_format();
    let stream_config: cpal::StreamConfig = config.into();

    let buffer: Arc<std::sync::Mutex<Vec<f32>>> =
        Arc::new(std::sync::Mutex::new(Vec::with_capacity(CHUNK_SAMPLES * 2)));
    let err_fn = |err| eprintln!("[voice_sync] audio stream error: {err}");

    let buf_cb = Arc::clone(&buffer);
    let stop_cb = Arc::clone(&stop);
    let tx_cb = wav_tx.clone();

    let stream = match sample_format {
        SampleFormat::F32 => device.build_input_stream(
            &stream_config,
            move |data: &[f32], _| {
                handle_samples(data, channels, sample_rate, &buf_cb, &stop_cb, &tx_cb);
            },
            err_fn,
            None,
        ),
        SampleFormat::I16 => device.build_input_stream(
            &stream_config,
            move |data: &[i16], _| {
                let f: Vec<f32> = data.iter().map(|&s| s as f32 / i16::MAX as f32).collect();
                handle_samples(&f, channels, sample_rate, &buf_cb, &stop_cb, &tx_cb);
            },
            err_fn,
            None,
        ),
        SampleFormat::U16 => device.build_input_stream(
            &stream_config,
            move |data: &[u16], _| {
                let f: Vec<f32> = data
                    .iter()
                    .map(|&s| (s as f32 - u16::MAX as f32 / 2.0) / (u16::MAX as f32 / 2.0))
                    .collect();
                handle_samples(&f, channels, sample_rate, &buf_cb, &stop_cb, &tx_cb);
            },
            err_fn,
            None,
        ),
        other => return Err(format!("unsupported sample format: {other:?}")),
    }
    .map_err(|e| format!("build input stream: {e}"))?;

    stream.play().map_err(|e| format!("play stream: {e}"))?;

    while !stop.load(Ordering::Relaxed) {
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
    drop(stream);
    Ok(())
}

fn handle_samples(
    data: &[f32],
    channels: usize,
    sample_rate: u32,
    buf: &Arc<std::sync::Mutex<Vec<f32>>>,
    stop: &Arc<AtomicBool>,
    tx: &mpsc::Sender<Vec<u8>>,
) {
    if stop.load(Ordering::Relaxed) {
        return;
    }
    let mono = downmix(data, channels);
    let resampled = resample_linear(&mono, sample_rate, SAMPLE_RATE);
    let Ok(mut b) = buf.lock() else { return };
    b.extend_from_slice(&resampled);
    while b.len() >= CHUNK_SAMPLES {
        let chunk: Vec<f32> = b.drain(..CHUNK_SAMPLES).collect();
        if let Some(bytes) = encode_wav(&chunk, SAMPLE_RATE) {
            // try_send drops chunks if the worker is backed up — better than blocking the audio thread.
            let _ = tx.try_send(bytes);
        }
    }
}

fn downmix(data: &[f32], channels: usize) -> Vec<f32> {
    if channels <= 1 {
        return data.to_vec();
    }
    data.chunks(channels)
        .map(|frame| frame.iter().sum::<f32>() / frame.len() as f32)
        .collect()
}

fn resample_linear(input: &[f32], src_rate: u32, dst_rate: u32) -> Vec<f32> {
    if src_rate == dst_rate || input.is_empty() {
        return input.to_vec();
    }
    let ratio = src_rate as f64 / dst_rate as f64;
    let out_len = ((input.len() as f64) / ratio).floor() as usize;
    let mut out = Vec::with_capacity(out_len);
    for i in 0..out_len {
        let src_pos = i as f64 * ratio;
        let idx = src_pos.floor() as usize;
        let frac = (src_pos - idx as f64) as f32;
        let a = input[idx];
        let b = input.get(idx + 1).copied().unwrap_or(a);
        out.push(a + (b - a) * frac);
    }
    out
}

fn encode_wav(samples: &[f32], sample_rate: u32) -> Option<Vec<u8>> {
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let mut buf = std::io::Cursor::new(Vec::<u8>::new());
    {
        let mut writer = hound::WavWriter::new(&mut buf, spec).ok()?;
        for &s in samples {
            let clamped = s.clamp(-1.0, 1.0);
            let v = (clamped * i16::MAX as f32) as i16;
            writer.write_sample(v).ok()?;
        }
        writer.finalize().ok()?;
    }
    Some(buf.into_inner())
}

// -- Worker: sidecar IPC -----------------------------------------------------

async fn run_worker(
    app: AppHandle,
    mut rx: mpsc::Receiver<Vec<u8>>,
    model_file: PathBuf,
    language: String,
    mut shutdown: oneshot::Receiver<()>,
) {
    loop {
        tokio::select! {
            _ = &mut shutdown => break,
            chunk = rx.recv() => {
                let Some(wav) = chunk else { break };
                match transcribe_chunk(&app, &model_file, &language, &wav).await {
                    Ok(text) if !text.is_empty() => {
                        let _ = app.emit("voice:transcript", Transcript { text });
                    }
                    Ok(_) => {}
                    Err(e) => eprintln!("[voice_sync] transcription failed: {e}"),
                }
            }
        }
    }
}

async fn transcribe_chunk(
    app: &AppHandle,
    model_file: &PathBuf,
    language: &str,
    wav_bytes: &[u8],
) -> Result<String, String> {
    let tmp = tempfile::Builder::new()
        .prefix("promptflow-chunk-")
        .suffix(".wav")
        .tempfile()
        .map_err(|e| format!("tempfile: {e}"))?;
    let path = tmp.path().to_path_buf();
    tokio::fs::write(&path, wav_bytes)
        .await
        .map_err(|e| format!("write wav: {e}"))?;

    let output = app
        .shell()
        .sidecar("whisper")
        .map_err(|e| format!("sidecar resolve: {e}"))?
        .args([
            "-m",
            &model_file.to_string_lossy(),
            "-f",
            &path.to_string_lossy(),
            "-l",
            language,
            "-nt", // no timestamps
            "-np", // no progress
        ])
        .output()
        .await
        .map_err(|e| format!("sidecar exec: {e}"))?;

    drop(tmp);

    if !output.status.success() {
        return Err(format!(
            "whisper exit {:?}: {}",
            output.status.code(),
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(text)
}
