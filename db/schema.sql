-- 사내 채팅 DB 스키마 (MySQL 8.4)
-- 실행: mysql -u root -p < db/schema.sql   또는 DBeaver에서 전체 실행(Alt+X)
-- ⚠️ 테이블을 지우고 다시 만든다. 개발용 데이터가 모두 사라진다.

CREATE DATABASE IF NOT EXISTS team_chat
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE team_chat;

DROP TABLE IF EXISTS schema_migrations;
DROP TABLE IF EXISTS folder_permissions;
DROP TABLE IF EXISTS file_activity;
DROP TABLE IF EXISTS files;
DROP TABLE IF EXISTS folders;
DROP TABLE IF EXISTS message_reactions;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS room_members;
DROP TABLE IF EXISTS rooms;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS departments;

-- 부서 목록 (권한의 기준이라 자유 입력 대신 목록에서 고른다)
CREATE TABLE departments (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(50) NOT NULL UNIQUE,
  sort_order  INT NOT NULL DEFAULT 0                       -- 화면 목록 순서
);

-- 사용자
CREATE TABLE users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(30)  NOT NULL UNIQUE,              -- 로그인 아이디
  password_hash VARCHAR(100) NOT NULL,                     -- bcrypt 결과 (비밀번호 원문 저장 금지)
  nickname      VARCHAR(30)  NOT NULL,                     -- 화면에 보이는 이름
  department    VARCHAR(50)  NULL,                         -- 부서 이름 (departments.name 중 하나)
  role          VARCHAR(20)  NOT NULL DEFAULT 'user',      -- 확장 칸: user / admin / bot …
  avatar_url    VARCHAR(255) NULL,                         -- 프로필 사진 주소 (/uploads/avatars/…). 없으면 이름 첫 글자
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- 부서 이름이 바뀌면 사람들 부서도 같이 바뀌고, 부서가 없어지면 '부서 없음'
  CONSTRAINT fk_users_department FOREIGN KEY (department) REFERENCES departments(name) ON UPDATE CASCADE ON DELETE SET NULL
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

-- ── 공유 드라이브 (9단계~) ──

-- 폴더 (parent_id 로 트리). 최상위 폴더는 parent_id = NULL
CREATE TABLE folders (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  parent_id            INT NULL,
  name                 VARCHAR(100) NOT NULL,
  inherit_permissions  BOOLEAN NOT NULL DEFAULT TRUE,      -- FALSE 면 위 폴더 권한을 이어받지 않음 🔒 (folder_permissions 참고)
  bot_enabled          BOOLEAN NOT NULL DEFAULT FALSE,     -- 12단계: 봇이 이 폴더 문서를 읽어도 되는지
  created_by           INT NULL,
  created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at           DATETIME NULL,                      -- 휴지통에 넣은 시각 (하위 폴더·파일은 같이 숨겨짐)
  deleted_by           INT NULL,
  FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_folder_parent (parent_id)
);

-- 파일 (실제 내용은 server/storage/files/<stored_name>, 원래 이름은 DB에만)
CREATE TABLE files (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  folder_id      INT NOT NULL,
  original_name  VARCHAR(255) NOT NULL,
  stored_name    CHAR(32) NOT NULL UNIQUE,                 -- 서버가 정한 무작위 이름 (확장자 없음)
  mime_type      VARCHAR(100) NOT NULL,
  size_bytes     BIGINT NOT NULL,
  uploaded_by    INT NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at     DATETIME NULL,
  deleted_by     INT NULL,
  FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_file_folder (folder_id)
);

-- 활동 기록: 누가 언제 무엇을 했나 (폴더·파일이 영구 삭제돼도 기록은 남도록 FK 없음)
CREATE TABLE file_activity (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NULL,
  action      VARCHAR(20) NOT NULL,                        -- upload / download / rename / move / delete / restore / purge / create_folder
  folder_id   INT NULL,
  file_id     INT NULL,
  detail      JSON NULL,                                   -- 예: { "from": "옛 이름", "to": "새 이름" }
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_activity_time (created_at)
);

-- 폴더 권한 (10단계). 한 줄 = "이 폴더에 이 대상은 이 등급"
-- 대상: user(사람) / department(부서) / all(전체). 등급: view 보기 < edit 편집 < manage 관리
-- 위 폴더 권한은 아래로 이어진다 (folders.inherit_permissions = FALSE 인 폴더에서 끊김)
CREATE TABLE folder_permissions (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  folder_id     INT NOT NULL,
  subject_type  VARCHAR(20) NOT NULL,                     -- user / department / all
  user_id       INT NULL,                                 -- subject_type = user 일 때
  department    VARCHAR(50) NULL,                         -- subject_type = department 일 때
  subject_key   VARCHAR(80) NOT NULL,                     -- 'user:3' / 'dept:개발팀' / 'all' — 같은 대상을 두 번 넣지 않게
  level         VARCHAR(10) NOT NULL,                     -- view / edit / manage
  granted_by    INT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_folder_subject (folder_id, subject_key),
  FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_perm_department FOREIGN KEY (department) REFERENCES departments(name) ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY (granted_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_perm_subject CHECK (subject_type IN ('user', 'department', 'all')),
  CONSTRAINT chk_perm_level CHECK (level IN ('view', 'edit', 'manage'))
);

-- DB 변경 기록 (npm run db:migrate 가 씀). 이 schema.sql 에는 아래 파일들 내용이 이미 들어 있으므로 "한 것"으로 기록해 둔다.
-- ⚠️ db/migrations 에 새 파일을 추가하면: 그 내용을 이 파일에도 반영하고, 아래 INSERT 에 한 줄 추가할 것
CREATE TABLE schema_migrations (
  version     VARCHAR(20) PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  applied_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO schema_migrations (version, name) VALUES
  ('007', '007_메시지_수정_삭제_반응.sql'),
  ('008', '008_프로필_사진.sql'),
  ('009', '009_부서목록_공유드라이브.sql'),
  ('010', '010_폴더_권한.sql');
