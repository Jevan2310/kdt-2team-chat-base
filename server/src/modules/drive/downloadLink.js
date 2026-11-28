import jwt from 'jsonwebtoken';
import { config } from '../../config.js';
import { DriveError } from './errors.js';

// 내려받기 서명 주소 (S5)
// 화면이 POST /files/:id/link 로 "60초짜리 표"를 받고, 그 주소로 브라우저가 바로 받는다.
// - 주소에 로그인 토큰을 싣지 않아도 되고(표는 그 파일·그 사람·60초만 유효), 파일을 메모리에 올리지 않는다
// - 실제로 받는 순간에도 권한을 다시 확인한다 (표를 받은 뒤 권한이 없어졌으면 거절)
const AUDIENCE = 'drive-download'; // 로그인 토큰과 섞여 쓰이지 않게 용도 표시
export const LINK_SECONDS = 60;

export function signDownload(userId, fileId, { inline = false } = {}) {
  return jwt.sign({ uid: userId, fid: fileId, inline }, config.jwtSecret, { audience: AUDIENCE, expiresIn: LINK_SECONDS });
}

export function verifyDownload(token) {
  try {
    const p = jwt.verify(String(token), config.jwtSecret, { audience: AUDIENCE });
    return { userId: Number(p.uid), fileId: Number(p.fid), inline: Boolean(p.inline) };
  } catch (err) {
    throw new DriveError(410, err.name === 'TokenExpiredError' ? '내려받기 주소가 만료됐어요. 다시 눌러 주세요.' : '잘못된 내려받기 주소예요.');
  }
}
