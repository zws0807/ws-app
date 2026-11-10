ALTER TABLE images ADD COLUMN sha256 TEXT NOT NULL DEFAULT '';
CREATE TABLE export_jobs(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),request_id TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',created_at TEXT NOT NULL,expires_at TEXT NOT NULL,lease_token TEXT,lease_until TEXT,object_key TEXT,upload_key TEXT,upload_id TEXT,error TEXT,UNIQUE(user_id,request_id));
CREATE UNIQUE INDEX one_active_export ON export_jobs(user_id) WHERE status IN ('pending','running');
CREATE TABLE export_snapshot_records(id INTEGER PRIMARY KEY AUTOINCREMENT,job_id TEXT NOT NULL REFERENCES export_jobs(id),kind TEXT NOT NULL,data TEXT NOT NULL);
CREATE INDEX export_snap_job ON export_snapshot_records(job_id,id);
CREATE TABLE export_file_refs(job_id TEXT NOT NULL REFERENCES export_jobs(id),image_id TEXT NOT NULL,object_key TEXT NOT NULL,width INTEGER NOT NULL,height INTEGER NOT NULL,bytes INTEGER NOT NULL,mime TEXT NOT NULL,sha256 TEXT NOT NULL,PRIMARY KEY(job_id,image_id));
CREATE TABLE outbox(job_id TEXT PRIMARY KEY REFERENCES export_jobs(id),sent_at TEXT);
