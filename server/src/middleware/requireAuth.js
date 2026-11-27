import { verifyToken, findUserById } from '../modules/auth/auth.service.js';

// 로그인한 사람만 통과. 요청 헤더 "Authorization: Bearer <토큰>" 을 확인하고 req.user 에 사용자를 넣는다.
export async function requireAuth(req, res, next) {
  const header = req.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: '로그인이 필요해요.' });

  try {
    const user = await findUserById(verifyToken(token));
    if (!user) return res.status(401).json({ message: '없는 사용자예요. 다시 로그인해 주세요.' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: '로그인이 만료됐어요. 다시 로그인해 주세요.' });
  }
}
