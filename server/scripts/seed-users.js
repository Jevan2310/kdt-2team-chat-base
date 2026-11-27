// 테스트 사용자 넣기: npm run seed:users
// ⚠️ 개발용. 비밀번호는 모두 test1234
import { pool } from '../src/db.js';
import { createUser } from '../src/modules/auth/auth.service.js';

const users = [
  { username: 'test1', nickname: '김테스트', department: '개발팀' },
  { username: 'test2', nickname: '이테스트', department: '디자인팀' },
  { username: 'test3', nickname: '박테스트', department: '인사팀' },
];

for (const u of users) {
  try {
    await createUser({ ...u, password: 'test1234' });
    console.log('추가:', u.username);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') console.log('이미 있음:', u.username);
    else throw err;
  }
}
await pool.end();
