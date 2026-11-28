-- 기본 데이터. schema.sql 다음에 실행한다.
-- 테스트 사용자는 비밀번호 암호화(bcrypt)가 필요해서 2단계에서 서버 스크립트로 넣는다.
USE team_chat;

INSERT INTO rooms (name, type) VALUES
  ('📢 전체 공지', 'group'),
  ('💬 자유 채팅', 'group');

-- 부서 목록 (회원가입·프로필에서 고름, 10단계 폴더 권한의 기준)
INSERT INTO departments (name, sort_order) VALUES
  ('경영지원팀', 10), ('인사팀', 20), ('기획팀', 30), ('개발팀', 40), ('디자인팀', 50), ('영업팀', 60);

-- 공유 드라이브 기본 폴더 (권한은 10단계에서)
INSERT INTO folders (id, parent_id, name) VALUES
  (1, NULL, '공통'), (2, 1, '양식'), (3, NULL, '개발팀'), (4, NULL, '디자인팀'), (5, NULL, '인사팀');
