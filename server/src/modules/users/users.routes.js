import express, { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth.js';
import { getIo } from '../../socket/io.js';
import { publicProfile } from '../auth/auth.service.js';
import { pool } from '../../db.js';
import { checkProfile, isUnknownDepartment, UNKNOWN_DEPARTMENT } from './users.rules.js';
import { AVATAR_MAX_BYTES, detectImageType, updateProfile, saveAvatar, clearAvatar } from './users.service.js';

const router = Router();
router.use(requireAuth);

// 프로필이 바뀌면 접속한 모두에게 알린다 → 다른 사람 화면의 이름·사진도 바로 바뀜
function announce(user) {
  try {
    getIo().emit('user:updated', publicProfile(user));
  } catch {
    // 소켓 준비 전이면 알림만 건너뜀
  }
}

// GET /api/users → { users: [{ id, nickname, department, role, avatarUrl }] }  (권한 줄 때 사람 고르기용, 공개 정보만)
router.get('/', async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, nickname, department, role, avatar_url AS avatarUrl FROM users ORDER BY department IS NULL, department, nickname',
  );
  res.json({ users: rows.map(publicProfile) });
});

// PATCH /api/users/me  { nickname?, department? } → { user }  (보낸 칸만 바뀜. department: null 이면 '부서 없음')
router.patch('/me', async (req, res) => {
  const error = checkProfile(req.body ?? {}, { partial: true });
  if (error) return res.status(400).json({ message: error });
  try {
    const user = await updateProfile(req.user.id, req.body);
    announce(user);
    res.json({ user });
  } catch (err) {
    if (isUnknownDepartment(err)) return res.status(400).json({ message: UNKNOWN_DEPARTMENT });
    throw err;
  }
});

// PUT /api/users/me/avatar  본문 = 이미지 파일 그대로 (Content-Type: image/jpeg | image/png | image/webp) → { user }
router.put(
  '/me/avatar',
  (req, res, next) =>
    express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: AVATAR_MAX_BYTES })(req, res, (err) => {
      if (err?.type === 'entity.too.large') return res.status(413).json({ message: '파일이 너무 커요. 2MB 이하로 올려 주세요.' });
      next(err);
    }),
  async (req, res) => {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ message: 'JPG·PNG·WEBP 사진만 올릴 수 있어요.' });
    }
    const ext = detectImageType(req.body);
    if (!ext) return res.status(400).json({ message: '사진 파일이 아니에요.' });
    const user = await saveAvatar(req.user, req.body, ext);
    announce(user);
    res.json({ user });
  },
);

// DELETE /api/users/me/avatar → { user } (이름 첫 글자 프로필로 돌아감)
router.delete('/me/avatar', async (req, res) => {
  const user = await clearAvatar(req.user);
  announce(user);
  res.json({ user });
});

export default router;
