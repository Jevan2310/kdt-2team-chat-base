import { randomBytes } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pool, withTx } from '../../db.js';
import { config } from '../../config.js';
import { findUserById } from '../auth/auth.service.js';

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024; // 2MB (화면에서 256px로 줄여 보내므로 보통 50KB 이하)
const AVATAR_DIR = path.join(config.uploadsDir, 'avatars');
const AVATAR_URL_PREFIX = '/uploads/avatars/';

// 파일 앞부분(매직 넘버)으로 진짜 이미지인지 확인한다. 파일 이름·Content-Type 은 속일 수 있어서 믿지 않는다.
export function detectImageType(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

// 보낸 칸만 바꾼다 (부서를 안 보냈는데 '부서 없음'이 되던 문제 방지)
export async function updateProfile(userId, { nickname, department }) {
  const sets = [];
  const values = [];
  if (nickname !== undefined) {
    sets.push('nickname = ?');
    values.push(nickname.trim());
  }
  if (department !== undefined) {
    sets.push('department = ?');
    values.push(department?.trim() || null);
  }
  if (sets.length) await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, [...values, userId]);
  return findUserById(userId);
}

// 예전 사진 파일 지우기 (우리 폴더 안의 파일만)
async function removeAvatarFile(avatarUrl) {
  if (!avatarUrl?.startsWith(AVATAR_URL_PREFIX)) return;
  const file = path.join(AVATAR_DIR, path.basename(avatarUrl));
  await unlink(file).catch(() => {}); // 이미 없으면 무시
}

// 새 사진 저장: 파일 이름은 서버가 정한다 (사용자 id + 무작위) → 이름 충돌·경로 조작 방지, 바뀔 때마다 주소가 달라져 캐시 문제 없음
// 사진 주소 바꾸기: 그 사람 행을 잠그고(FOR UPDATE) 예전 주소를 읽은 뒤 바꾼다
// → 거의 동시에 두 번 바꿔도 각각 "바로 앞 사진"을 정확히 지워서 주인 없는 파일이 남지 않음
async function swapAvatarUrl(userId, nextUrl) {
  const previous = await withTx(async (conn) => {
    const [[row]] = await conn.query('SELECT avatar_url AS avatarUrl FROM users WHERE id = ? FOR UPDATE', [userId]);
    await conn.query('UPDATE users SET avatar_url = ? WHERE id = ?', [nextUrl, userId]);
    return row?.avatarUrl ?? null;
  });
  await removeAvatarFile(previous);
}

export async function saveAvatar(user, buf, ext) {
  await mkdir(AVATAR_DIR, { recursive: true });
  const fileName = `${user.id}-${randomBytes(6).toString('hex')}.${ext}`;
  await writeFile(path.join(AVATAR_DIR, fileName), buf);
  await swapAvatarUrl(user.id, AVATAR_URL_PREFIX + fileName);
  return findUserById(user.id);
}

export async function clearAvatar(user) {
  await swapAvatarUrl(user.id, null);
  return findUserById(user.id);
}
