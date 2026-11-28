-- 8단계: 프로필 사진
-- 이미 DB를 쓰고 있다면 이 파일만 한 번 실행한다 (데이터 유지). 새로 설치하면 필요 없다.
USE team_chat;

ALTER TABLE users ADD COLUMN avatar_url VARCHAR(255) NULL AFTER role;
