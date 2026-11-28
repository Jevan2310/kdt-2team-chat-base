import { Router } from 'express';
import { createUser, checkLogin, signToken } from './auth.service.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { checkProfile, isUnknownDepartment, UNKNOWN_DEPARTMENT } from '../users/users.rules.js';

const router = Router();

const USERNAME_RULE = /^[a-z0-9_]{4,20}$/;

function validateSignup({ username, password, nickname, department }) {
  if (!USERNAME_RULE.test(username ?? '')) return '아이디는 영어 소문자·숫자·_ 4~20자예요.';
  if (typeof password !== 'string' || password.length < 6) return '비밀번호는 6자 이상이에요.';
  return checkProfile({ nickname, department });
}

// POST /api/auth/signup  { username, password, nickname, department? } → { token, user }
router.post('/signup', async (req, res) => {
  const error = validateSignup(req.body ?? {});
  if (error) return res.status(400).json({ message: error });

  const { username, password, nickname, department } = req.body;
  try {
    const user = await createUser({ username, password, nickname: nickname.trim(), department: department?.trim() });
    res.status(201).json({ token: signToken(user), user });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: '이미 쓰는 아이디예요.' });
    if (isUnknownDepartment(err)) return res.status(400).json({ message: UNKNOWN_DEPARTMENT });
    throw err;
  }
});

// POST /api/auth/login  { username, password } → { token, user }
router.post('/login', async (req, res) => {
  const { username, password } = req.body ?? {};
  const user = await checkLogin(String(username ?? ''), String(password ?? ''));
  if (!user) return res.status(401).json({ message: '아이디 또는 비밀번호가 틀려요.' });
  res.json({ token: signToken(user), user });
});

// GET /api/auth/me  (로그인 필요) → { user }
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
