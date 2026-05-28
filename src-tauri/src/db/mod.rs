use tauri_plugin_sql::{Migration, MigrationKind};

pub fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "initial schema",
            sql: include_str!("schema.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "elgato-style settings",
            sql: include_str!("migrations/002_settings_v2.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "voice sync settings",
            sql: include_str!("migrations/003_voice_sync.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "elgato layout settings",
            sql: include_str!("migrations/004_layout_settings.sql"),
            kind: MigrationKind::Up,
        },
    ]
}
