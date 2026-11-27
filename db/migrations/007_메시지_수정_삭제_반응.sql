-- 7단계: 메시지 수정·삭제·반응
-- 이미 schema.sql 로 DB를 만들어 쓰고 있다면 이 파일만 한 번 실행한다 (데이터 유지).
-- 새로 설치하면 필요 없다 (schema.sql 에 들어 있음).
USE team_chat;

ALTER TABLE messages
  ADD COLUMN edited_at  DATETIME NULL AFTER created_at,
  ADD COLUMN deleted_at DATETIME NULL AFTER edited_at;

CREATE TABLE IF NOT EXISTS message_reactions (
  message_id  INT NOT NULL,
  user_id     INT NOT NULL,
  emoji       VARCHAR(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (message_id, user_id, emoji),
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
