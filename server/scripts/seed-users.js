// 테스트 사용자 넣기: npm run seed:users
// ⚠️ 개발용. 비밀번호는 모두 test1234
// admin = 관리자(모든 폴더 관리), test1 = 개발팀 폴더 관리자(팀장 역할)
import { pool } from '../src/db.js';
import { createUser } from '../src/modules/auth/auth.service.js';

const users = [
  { username: 'test1', nickname: '김테스트', department: '개발팀' },
  { username: 'test2', nickname: '이테스트', department: '디자인팀' },
  { username: 'test3', nickname: '박테스트', department: '인사팀' },
  { username: 'admin', nickname: '관리자', department: '경영지원팀', role: 'admin' },
];

for (const { role, ...u } of users) {
  try {
    await createUser({ ...u, password: 'test1234' });
    console.log('추가:', u.username);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') console.log('이미 있음:', u.username);
    else throw err;
  }
  if (role) await pool.query('UPDATE users SET role = ? WHERE username = ?', [role, u.username]);
}

// test1 을 개발팀 폴더 관리자로 (권한 설정을 시험할 수 있게)
await pool.query(
  `INSERT IGNORE INTO folder_permissions (folder_id, subject_type, user_id, subject_key, level)
   SELECT f.id, 'user', u.id, CONCAT('user:', u.id), 'manage'
     FROM folders f JOIN users u ON u.username = 'test1'
    WHERE f.id = 3 AND f.name = '개발팀'`,
);
await pool.end();
