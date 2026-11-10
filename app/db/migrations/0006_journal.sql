CREATE TABLE journals(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),date TEXT NOT NULL,body TEXT NOT NULL,created_at TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 0,deleted_at TEXT,request_id TEXT,UNIQUE(user_id,request_id));
CREATE INDEX journals_user_date ON journals(user_id,created_at,id);
