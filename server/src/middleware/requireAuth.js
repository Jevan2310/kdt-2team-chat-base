import { verifyToken, findUserById } from '../modules/auth/auth.service.js';

// 로그인한 사람만 통과. 요청 헤더 "Authorization: Bearer <토큰>" 을 확인하고 req.user 에 사용자를 넣는다.
// 토큰이 틀리거나 만료됐을 때만 401 (화면은 401 일 때만 로그아웃한다).
// DB 가 잠깐 안 될 때 나는 오류는 401 이 아니라 공통 오류 처리(500)로 → 사용자가 괜히 로그아웃되지 않게
export async function requireAuth(req, res, next) {
  const header = req.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: '로그인이 필요해요.' });

  let userId;
  try {
    userId = verifyToken(token);
  } catch {
    return res.status(401).json({ message: '로그인이 만료됐어요. 다시 로그인해 주세요.' });
  }
  const user = await findUserById(userId); // 여기서 나는 DB 오류는 Express 5 가 공통 오류 처리로 넘김
  if (!user) return res.status(401).json({ message: '없는 사용자예요. 다시 로그인해 주세요.' });
  req.user = user;
  next();
}
