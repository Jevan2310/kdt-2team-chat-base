import { pool } from '../../db.js';
import { DriveError } from './errors.js';

// ── 폴더 권한 (10단계) ──
// 등급: view 보기(목록·내려받기) < edit 편집(올리기·이름·옮기기·휴지통) < manage 관리(권한 바꾸기·영구 삭제)
// 대상: user(그 사람) / department(그 부서 사람 모두) / all(모든 직원)
// 계산: 이 폴더에서 위로 올라가며 나에게 해당하는 줄을 모으고 가장 높은 등급. 상속을 끊은 폴더(inherit=false)에서 멈춘다.
// 관리자(role=admin)는 어디서나 manage.

export const LEVELS = ['view', 'edit', 'manage'];
const RANK = { view: 1, edit: 2, manage: 3 };
export const rankOf = (level) => RANK[level] ?? 0;
export const levelName = (rank) => LEVELS[rank - 1] ?? null; // 0 → null (권한 없음)

const isAdmin = (user) => user?.role === 'admin';

// 폴더 id → 그 폴더에 직접 준 권한 줄 목록
export async function loadPermissions(db = pool) {
  const [rows] = await db.query(
    `SELECT p.id, p.folder_id AS folderId, p.subject_type AS type, p.user_id AS userId, p.department, p.level,
            u.nickname, u.department AS userDepartment
       FROM folder_permissions p LEFT JOIN users u ON u.id = p.user_id
      ORDER BY p.id`,
  );
  const byFolder = new Map();
  for (const r of rows) {
    if (!byFolder.has(r.folderId)) byFolder.set(r.folderId, []);
    byFolder.get(r.folderId).push(r);
  }
  return byFolder;
}

function applies(grant, user) {
  if (grant.type === 'all') return true;
  if (grant.type === 'user') return grant.userId === user.id;
  if (grant.type === 'department') return Boolean(user.department) && grant.department === user.department;
  return false;
}

// 이 사람이 이 폴더에 가진 등급 (0 = 권한 없음, 1 보기, 2 편집, 3 관리)
// folders: loadFolders() 결과 Map (inherit 칸 필요), perms: loadPermissions() 결과
export function rankIn(user, folderId, folders, perms) {
  if (isAdmin(user)) return RANK.manage;
  let best = 0;
  for (let cur = folders.get(folderId), steps = 0; cur && steps < 1000; cur = folders.get(cur.parentId), steps++) {
    for (const g of perms.get(cur.id) ?? []) if (applies(g, user)) best = Math.max(best, RANK[g.level]);
    if (!cur.inherit) break; // 🔒 상속 끊김: 더 위 폴더 권한은 보지 않음
  }
  return best;
}

const DENIED = {
  view: '이 폴더를 볼 권한이 없어요.',
  edit: '이 폴더를 바꿀 권한이 없어요. (편집 권한 필요)',
  manage: '이 폴더를 관리할 권한이 없어요. (관리 권한 필요)',
};

// ★ 권한 확인은 모두 여기로 (S1). 아예 볼 수 없으면 404 (폴더가 있는지도 알려 주지 않음), 등급이 모자라면 403
export function assertCan(user, folderId, need, folders, perms, { notFound = '폴더를 찾을 수 없어요.' } = {}) {
  const rank = rankIn(user, folderId, folders, perms);
  if (rank === 0) throw new DriveError(404, notFound);
  if (rank < RANK[need]) throw new DriveError(403, DENIED[need]);
  return rank;
}

// 맨 위(드라이브 바로 아래)에 폴더를 만들거나 옮기는 것은 관리자만
export function assertCanRoot(user) {
  if (!isAdmin(user)) throw new DriveError(403, '드라이브 맨 위에는 관리자만 폴더를 만들거나 옮길 수 있어요.');
}

export const canUseRoot = isAdmin;

// 화면에 보여 줄 권한 줄 모양
export function toGrant(g) {
  return {
    id: g.id,
    type: g.type,
    level: g.level,
    user: g.type === 'user' ? { id: g.userId, nickname: g.nickname, department: g.userDepartment } : null,
    department: g.type === 'department' ? g.department : null,
  };
}

// 받은 권한 줄 목록 검사·정리 → [{ type, userId, department, level, key }] (같은 대상은 하나만, 높은 등급)
export function normalizeGrants(input) {
  if (!Array.isArray(input)) throw new DriveError(400, '권한 목록이 잘못됐어요.');
  if (input.length > 200) throw new DriveError(400, '권한 줄이 너무 많아요.');
  const byKey = new Map();
  for (const g of input) {
    const level = String(g?.level ?? '');
    if (!RANK[level]) throw new DriveError(400, '등급은 보기·편집·관리 중 하나예요.');
    let item;
    if (g?.type === 'all') item = { type: 'all', userId: null, department: null, key: 'all' };
    else if (g?.type === 'user' && Number.isSafeInteger(g.userId) && g.userId > 0) item = { type: 'user', userId: g.userId, department: null, key: `user:${g.userId}` };
    else if (g?.type === 'department' && typeof g.department === 'string' && g.department.trim()) {
      const d = g.department.trim();
      item = { type: 'department', userId: null, department: d, key: `dept:${d}` };
    } else throw new DriveError(400, '권한 대상은 사람·부서·전체 중 하나예요.');
    const prev = byKey.get(item.key);
    if (!prev || RANK[level] > RANK[prev.level]) byKey.set(item.key, { ...item, level });
  }
  return [...byKey.values()];
}
