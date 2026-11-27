-- 기본 데이터. schema.sql 다음에 실행한다.
-- 테스트 사용자는 비밀번호 암호화(bcrypt)가 필요해서 2단계에서 서버 스크립트로 넣는다.
USE team_chat;

INSERT INTO rooms (name, type) VALUES
  ('📢 전체 공지', 'group'),
  ('💬 자유 채팅', 'group');
