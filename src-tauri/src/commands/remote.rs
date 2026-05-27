use axum::{
    Router,
    extract::{
        State as AxumState,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    response::Html,
    routing::get,
};
use local_ip_address::local_ip;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Listener, Manager, State as TauriState};
use tokio::sync::{Mutex, broadcast};

const REMOTE_INDEX: &str = include_str!("../../../remote-ui/index.html");

#[derive(Clone)]
struct AxumServerState {
    tx: broadcast::Sender<String>,
    last_state: Arc<Mutex<Option<String>>>,
    app: AppHandle,
}

pub struct RemoteServerHandle {
    inner: Mutex<Option<RunningServer>>,
}

struct RunningServer {
    port: u16,
    tx: broadcast::Sender<String>,
    last_state: Arc<Mutex<Option<String>>>,
    shutdown: tokio::sync::oneshot::Sender<()>,
}

impl RemoteServerHandle {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(None),
        }
    }
}

#[tauri::command]
pub async fn start_remote_server(
    app: AppHandle,
    handle: TauriState<'_, RemoteServerHandle>,
) -> Result<u16, String> {
    let mut guard = handle.inner.lock().await;
    if let Some(existing) = guard.as_ref() {
        return Ok(existing.port);
    }

    let (tx, _rx) = broadcast::channel::<String>(64);
    let last_state: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
    let state = AxumServerState {
        tx: tx.clone(),
        last_state: last_state.clone(),
        app: app.clone(),
    };

    let router = Router::new()
        .route("/", get(serve_index))
        .route("/index.html", get(serve_index))
        .route("/ws", get(ws_handler))
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:0")
        .await
        .map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();

    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();
    tokio::spawn(async move {
        let _ = axum::serve(listener, router)
            .with_graceful_shutdown(async {
                let _ = shutdown_rx.await;
            })
            .await;
    });

    *guard = Some(RunningServer {
        port,
        tx,
        last_state,
        shutdown: shutdown_tx,
    });

    eprintln!("[promptflow] remote server listening on port {}", port);
    Ok(port)
}

#[tauri::command]
pub async fn stop_remote_server(
    handle: TauriState<'_, RemoteServerHandle>,
) -> Result<(), String> {
    let mut guard = handle.inner.lock().await;
    if let Some(running) = guard.take() {
        let _ = running.shutdown.send(());
    }
    Ok(())
}

#[tauri::command]
pub async fn broadcast_remote_state(
    payload: String,
    handle: TauriState<'_, RemoteServerHandle>,
) -> Result<(), String> {
    let guard = handle.inner.lock().await;
    if let Some(running) = guard.as_ref() {
        *running.last_state.lock().await = Some(payload.clone());
        let _ = running.tx.send(payload);
    }
    Ok(())
}

#[tauri::command]
pub async fn get_local_ip() -> Result<String, String> {
    local_ip().map(|ip| ip.to_string()).map_err(|e| e.to_string())
}

async fn serve_index() -> Html<&'static str> {
    Html(REMOTE_INDEX)
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    AxumState(state): AxumState<AxumServerState>,
) -> axum::response::Response {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: AxumServerState) {
    use futures_util::{SinkExt, StreamExt};
    let (mut sender, mut receiver) = socket.split();

    // Send current snapshot on connect.
    if let Some(snapshot) = state.last_state.lock().await.clone() {
        let _ = sender.send(Message::Text(snapshot.into())).await;
    }

    let mut rx = state.tx.subscribe();
    let mut send_task = tokio::spawn(async move {
        while let Ok(msg) = rx.recv().await {
            if sender.send(Message::Text(msg.into())).await.is_err() {
                break;
            }
        }
    });

    let app = state.app.clone();
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            if let Message::Text(txt) = msg {
                let _ = app.emit("remote:command", txt.to_string());
            }
        }
    });

    tokio::select! {
        _ = (&mut send_task) => recv_task.abort(),
        _ = (&mut recv_task) => send_task.abort(),
    };
}

/// Subscribes to `remote:state-out` Tauri events from the frontend and
/// forwards the payload to all connected WebSocket clients.
pub fn install_state_listener(app: &AppHandle) {
    let app_clone = app.clone();
    app.listen("remote:state-out", move |event| {
        let payload = event.payload().to_string();
        let handle_app = app_clone.clone();
        tauri::async_runtime::spawn(async move {
            let state = handle_app.state::<RemoteServerHandle>();
            let guard = state.inner.lock().await;
            if let Some(running) = guard.as_ref() {
                *running.last_state.lock().await = Some(payload.clone());
                let _ = running.tx.send(payload);
            }
        });
    });
}
