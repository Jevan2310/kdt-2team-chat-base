import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../../db.js';
import { config } from '../../config.js';

// 화면에 내보내도 되는 칸만 고른다 (password_hash 는 절대 내보내지 않음)
const PUBLIC_COLUMNS = 'id, username, nickname, department, role, created_at AS createdAt';

export async function findUserById(id) {
  const [rows] = await pool.query(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = ?`, [id]);
  return rows[0] ?? null;
}

export async function createUser({ username, password, nickname, department }) {
  const passwordHash = await bcrypt.hash(password, 10); // 10 = 암호화 반복 강도
  const [result] = await pool.query(
    'INSERT INTO users (username, password_hash, nickname, department) VALUES (?, ?, ?, ?)',
    [username, passwordHash, nickname, department || null],
  );
  return findUserById(result.insertId);
}

// 아이디·비밀번호가 맞으면 사용자, 틀리면 null
export async function checkLogin(username, password) {
  const [rows] = await pool.query('SELECT id, password_hash FROM users WHERE username = ?', [username]);
  const row = rows[0];
  if (!row) return null;
  const ok = await bcrypt.compare(password, row.password_hash);
  return ok ? findUserById(row.id) : null;
}

// 토큰 = "이 사람은 id N번" 이라는 서명된 표. 7일 동안 유효
export function signToken(user) {
  return jwt.sign({ sub: user.id }, config.jwtSecret, { expiresIn: '7d' });
}

// 토큰이 위조·만료면 예외가 난다
export function verifyToken(token) {
  const payload = jwt.verify(token, config.jwtSecret);
  return Number(payload.sub);
}
