use std::sync::Mutex;
use tauri::{Manager, RunEvent};
use tauri_plugin_shell::{process::CommandChild, ShellExt};

struct ServerProcess(Mutex<Option<CommandChild>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let (mut events, child) = app
                .shell()
                .sidecar("vovchikgram-server")?
                .args(["--port", "8787"])
                .spawn()?;
            app.manage(ServerProcess(Mutex::new(Some(child))));
            tauri::async_runtime::spawn(async move {
                while let Some(_event) = events.recv().await {}
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build vovchikGram desktop");

    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            if let Some(server) = handle.try_state::<ServerProcess>() {
                if let Ok(mut child) = server.0.lock() {
                    if let Some(child) = child.take() {
                        let _ = child.kill();
                    }
                }
            }
        }
    });
}
