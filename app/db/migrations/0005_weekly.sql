CREATE TABLE weeks(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),start_date TEXT NOT NULL,end_date TEXT NOT NULL,goal TEXT NOT NULL DEFAULT '',version INTEGER NOT NULL DEFAULT 0,UNIQUE(user_id,start_date),UNIQUE(id,user_id));
CREATE INDEX weeks_user_date ON weeks(user_id,start_date);
CREATE TABLE tasks(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,week_id TEXT NOT NULL,title TEXT NOT NULL,target INTEGER NOT NULL CHECK(target>=1 AND target<=1000),priority TEXT NOT NULL CHECK(priority IN ('important','normal')),sort_order INTEGER NOT NULL,version INTEGER NOT NULL DEFAULT 0,deleted_at TEXT,FOREIGN KEY(week_id,user_id) REFERENCES weeks(id,user_id),UNIQUE(id,user_id));
CREATE INDEX tasks_week ON tasks(user_id,week_id);
CREATE UNIQUE INDEX important_per_week ON tasks(user_id,week_id) WHERE priority='important' AND deleted_at IS NULL;
CREATE TABLE checkins(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,task_id TEXT NOT NULL,request_id TEXT NOT NULL,created_at TEXT NOT NULL,revoked_at TEXT,FOREIGN KEY(task_id,user_id) REFERENCES tasks(id,user_id),UNIQUE(user_id,task_id,request_id));
CREATE INDEX checkins_task ON checkins(user_id,task_id);
CREATE TRIGGER checkin_insert AFTER INSERT ON checkins BEGIN UPDATE tasks SET version=version+1 WHERE id=NEW.task_id; END;
CREATE TRIGGER checkin_revoke AFTER UPDATE OF revoked_at ON checkins WHEN OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL BEGIN UPDATE tasks SET version=version+1 WHERE id=NEW.task_id; END;
