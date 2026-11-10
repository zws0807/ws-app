CREATE TABLE users(id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE,display_name TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE credentials(user_id TEXT PRIMARY KEY REFERENCES users(id),password_hash TEXT NOT NULL,recovery_hash TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1);
CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),credential_version INTEGER NOT NULL,expires_at TEXT NOT NULL);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE storage_usage(user_id TEXT PRIMARY KEY REFERENCES users(id),used_bytes INTEGER NOT NULL DEFAULT 0 CHECK(used_bytes>=0),reserved_bytes INTEGER NOT NULL DEFAULT 0 CHECK(reserved_bytes>=0));
