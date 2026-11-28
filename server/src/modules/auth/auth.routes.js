import { Router } from 'express';
import { createUser, checkLogin, signToken } from './auth.service.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { checkProfile, isUnknownDepartment, UNKNOWN_DEPARTMENT } from '../users/users.rules.js';
import { createLimiter, tooMany } from '../../lib/rateLimit.js';

// 로그인 시도 제한: 비밀번호를 계속 바꿔 넣어 보는 공격 막기
// - 같은 곳(IP)+같은 아이디: 15분에 10번 틀리면 막음 (성공하면 초기화)
// - 같은 곳(IP) 전체: 15분에 50번 틀리면 막음 (아이디를 바꿔 가며 시도하는 것 막기)
// 회원가입: 같은 곳에서 1시간에 20번까지
const loginPerUser = createLimiter({ windowMs: 15 * 60 * 1000, max: 10 });
const loginPerIp = createLimiter({ windowMs: 15 * 60 * 1000, max: 50 });
const signupPerIp = createLimiter({ windowMs: 60 * 60 * 1000, max: 20 });

const router = Router();

const USERNAME_RULE = /^[a-z0-9_]{4,20}$/;

function validateSignup({ username, password, nickname, department }) {
  if (!USERNAME_RULE.test(username ?? '')) return '아이디는 영어 소문자·숫자·_ 4~20자예요.';
  if (typeof password !== 'string' || password.length < 6) return '비밀번호는 6자 이상이에요.';
  return checkProfile({ nickname, department });
}

// POST /api/auth/signup  { username, password, nickname, department? } → { token, user }
router.post('/signup', async (req, res) => {
  const wait = signupPerIp.blockedFor(req.ip);
  if (wait) return tooMany(res, wait, '회원가입');
  signupPerIp.hit(req.ip);

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
  const userKey = `${req.ip}|${String(username ?? '').toLowerCase()}`;
  const wait = Math.max(loginPerUser.blockedFor(userKey), loginPerIp.blockedFor(req.ip));
  if (wait) return tooMany(res, wait, '로그인');

  const user = await checkLogin(String(username ?? ''), String(password ?? ''));
  if (!user) {
    loginPerUser.hit(userKey);
    loginPerIp.hit(req.ip);
    return res.status(401).json({ message: '아이디 또는 비밀번호가 틀려요.' });
  }
  loginPerUser.reset(userKey);
  res.json({ token: signToken(user), user });
});

// GET /api/auth/me  (로그인 필요) → { user }
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
