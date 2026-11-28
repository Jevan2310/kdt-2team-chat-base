import express, { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth.js';
import { getIo } from '../../socket/io.js';
import { checkProfile } from './users.rules.js';
import { AVATAR_MAX_BYTES, detectImageType, updateProfile, saveAvatar, clearAvatar } from './users.service.js';

const router = Router();
router.use(requireAuth);

// 프로필이 바뀌면 접속한 모두에게 알린다 → 다른 사람 화면의 이름·사진도 바로 바뀜
function announce(user) {
  const { id, nickname, department, role, avatarUrl } = user;
  getIo()?.emit('user:updated', { id, nickname, department, role, avatarUrl });
}

// PATCH /api/users/me  { nickname, department? } → { user }
router.patch('/me', async (req, res) => {
  const error = checkProfile(req.body ?? {});
  if (error) return res.status(400).json({ message: error });
  const user = await updateProfile(req.user.id, req.body);
  announce(user);
  res.json({ user });
});

// PUT /api/users/me/avatar  본문 = 이미지 파일 그대로 (Content-Type: image/jpeg | image/png | image/webp) → { user }
router.put(
  '/me/avatar',
  express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: AVATAR_MAX_BYTES }),
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
