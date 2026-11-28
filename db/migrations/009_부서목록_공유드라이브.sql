-- 9단계: 부서 목록 + 공유 드라이브 (폴더·파일·활동 기록)
-- 이미 DB를 쓰고 있다면 이 파일만 한 번 실행한다 (데이터 유지). 새로 설치하면 필요 없다.
USE team_chat;

-- 부서 목록
CREATE TABLE departments (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(50) NOT NULL UNIQUE,
  sort_order  INT NOT NULL DEFAULT 0
);
INSERT INTO departments (name, sort_order) VALUES
  ('경영지원팀', 10), ('인사팀', 20), ('기획팀', 30), ('개발팀', 40), ('디자인팀', 50), ('영업팀', 60);

-- 지금까지 사람들이 직접 적은 부서도 목록에 넣는다 (그래야 아래 FK 가 걸림). 빈 글자는 '부서 없음'으로
UPDATE users SET department = NULL WHERE department IS NOT NULL AND TRIM(department) = '';
UPDATE users SET department = TRIM(department) WHERE department IS NOT NULL;
INSERT IGNORE INTO departments (name, sort_order)
  SELECT DISTINCT department, 100 FROM users WHERE department IS NOT NULL;

ALTER TABLE users
  ADD CONSTRAINT fk_users_department FOREIGN KEY (department) REFERENCES departments(name)
  ON UPDATE CASCADE ON DELETE SET NULL;

-- ── 공유 드라이브 (9단계~) ──

-- 폴더 (parent_id 로 트리). 최상위 폴더는 parent_id = NULL
CREATE TABLE folders (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  parent_id            INT NULL,
  name                 VARCHAR(100) NOT NULL,
  inherit_permissions  BOOLEAN NOT NULL DEFAULT TRUE,      -- 10단계: FALSE 면 위 폴더 권한을 이어받지 않음 🔒
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

-- 기본 폴더
INSERT INTO folders (id, parent_id, name) VALUES
  (1, NULL, '공통'), (2, 1, '양식'), (3, NULL, '개발팀'), (4, NULL, '디자인팀'), (5, NULL, '인사팀');
