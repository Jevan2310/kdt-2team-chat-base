-- 10단계: 폴더 권한 (보기·편집·관리, 사람·부서·전체, 위 폴더에서 상속)
-- npm run db:migrate 로 실행 (손으로 실행해도 됨). 새로 설치하면 schema.sql·seed.sql 에 들어 있다.
USE team_chat;

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

-- 기본 폴더 권한: 공통=전체 보기, 공통/양식=경영지원팀 편집(+공통 보기 상속), 팀 폴더=그 팀 편집, 인사팀=상속 끊음 🔒
UPDATE folders SET inherit_permissions = FALSE WHERE id = 5 AND name = '인사팀';
INSERT IGNORE INTO folder_permissions (folder_id, subject_type, user_id, department, subject_key, level)
          SELECT id, 'all',        NULL, NULL,         'all',             'view' FROM folders WHERE id = 1 AND name = '공통'
UNION ALL SELECT id, 'department', NULL, '경영지원팀', 'dept:경영지원팀', 'edit' FROM folders WHERE id = 2 AND name = '양식'
UNION ALL SELECT id, 'department', NULL, '개발팀',     'dept:개발팀',     'edit' FROM folders WHERE id = 3 AND name = '개발팀'
UNION ALL SELECT id, 'department', NULL, '디자인팀',   'dept:디자인팀',   'edit' FROM folders WHERE id = 4 AND name = '디자인팀'
UNION ALL SELECT id, 'department', NULL, '인사팀',     'dept:인사팀',     'edit' FROM folders WHERE id = 5 AND name = '인사팀';
