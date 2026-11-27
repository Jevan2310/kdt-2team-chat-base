-- 사내 채팅 DB 스키마 (MySQL 8.4)
-- 실행: mysql -u root -p < db/schema.sql   또는 DBeaver에서 전체 실행(Alt+X)
-- ⚠️ 테이블을 지우고 다시 만든다. 개발용 데이터가 모두 사라진다.

CREATE DATABASE IF NOT EXISTS team_chat
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE team_chat;

DROP TABLE IF EXISTS message_reactions;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS room_members;
DROP TABLE IF EXISTS rooms;
DROP TABLE IF EXISTS users;

-- 사용자
CREATE TABLE users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(30)  NOT NULL UNIQUE,              -- 로그인 아이디
  password_hash VARCHAR(100) NOT NULL,                     -- bcrypt 결과 (비밀번호 원문 저장 금지)
  nickname      VARCHAR(30)  NOT NULL,                     -- 화면에 보이는 이름
  department    VARCHAR(50)  NULL,                         -- 부서 (사내 채팅)
  role          VARCHAR(20)  NOT NULL DEFAULT 'user',      -- 확장 칸: user / admin / bot …
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 채팅방
CREATE TABLE rooms (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(50) NOT NULL,
  type        VARCHAR(20) NOT NULL DEFAULT 'group',        -- 확장 칸: group / direct / notice …
  created_by  INT NULL,                                    -- 만든 사람 (기본 방은 NULL)
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- 방 참여자 + 어디까지 읽었는지 (읽음 표시·안 읽은 개수의 기준)
CREATE TABLE room_members (
  room_id               INT NOT NULL,
  user_id               INT NOT NULL,
  last_read_message_id  INT NULL,                          -- 이 번호까지 읽음 (책갈피)
  joined_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (room_id, user_id),
  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 메시지
CREATE TABLE messages (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  room_id     INT NOT NULL,
  user_id     INT NULL,                                    -- 시스템 메시지(입장 안내 등)는 NULL
  type        VARCHAR(20) NOT NULL DEFAULT 'text',         -- 확장 칸: text / system / vacation / bot …
  content     TEXT NOT NULL,
  metadata    JSON NULL,                                   -- 확장 칸: 종류별 추가 데이터 (예: 휴가 날짜)
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  edited_at   DATETIME NULL,                               -- 수정한 시각 (화면에 "수정됨")
  deleted_at  DATETIME NULL,                               -- 삭제한 시각 (행은 남기고 내용만 비움 → 읽음 숫자가 안 꼬임)
  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_room_message (room_id, id)                     -- 방별 최근 메시지 조회용
);

-- 메시지 반응 (이모지). 한 사람이 한 메시지에 같은 이모지는 한 번만 → 다시 누르면 취소
CREATE TABLE message_reactions (
  message_id  INT NOT NULL,
  user_id     INT NOT NULL,
  emoji       VARCHAR(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,  -- _bin: 이모지끼리 같다고 비교되지 않게
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (message_id, user_id, emoji),
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
