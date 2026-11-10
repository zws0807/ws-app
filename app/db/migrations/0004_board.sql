CREATE TABLE boards(user_id TEXT PRIMARY KEY REFERENCES users(id),version INTEGER NOT NULL DEFAULT 0,height INTEGER NOT NULL DEFAULT 520,elements TEXT NOT NULL DEFAULT '[]');
CREATE TRIGGER board_refs AFTER UPDATE OF elements ON boards BEGIN
 DELETE FROM image_refs WHERE user_id=NEW.user_id AND ref_type='board' AND ref_id=NEW.user_id;
 INSERT OR IGNORE INTO image_refs(image_id,user_id,ref_type,ref_id) SELECT json_extract(value,'$.imageId'),NEW.user_id,'board',NEW.user_id FROM json_each(NEW.elements) WHERE json_extract(value,'$.type')='image';
END;
