import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { pool, withLock, withTx } from '../../db.js';
import { config } from '../../config.js';
import { DriveError } from './errors.js';
import {
  assertCan,
  assertCanRoot,
  canUseRoot,
  levelName,
  loadPermissions,
  normalizeGrants,
  rankIn,
  rankOf,
  toGrant,
} from './permissions.js';

export { DriveError };
export const storedPath = (storedName) => path.join(config.storageDir, storedName);

// 폴더 트리를 바꾸는 작업(만들기·옮기기·지우기·복원·영구 삭제·권한 바꾸기)은 한 번에 하나씩 → 이름 중복·순환이 생기지 않게
const TREE_LOCK = 'drive_tree';

// 받은 사람이 실수로 실행하면 위험한 파일 (Windows 실행·스크립트·바로가기 포함)
const BLOCKED_EXTENSIONS = new Set([
  'exe', 'msi', 'msp', 'bat', 'cmd', 'com', 'scr', 'pif', 'cpl', 'msc', 'reg', 'lnk', 'url', 'scf', 'hta',
  'ps1', 'psm1', 'vbs', 'vbe', 'js', 'jse', 'wsf', 'wsh', 'jar', 'apk', 'dmg', 'pkg', 'app', 'sh', 'command',
]);

// ── 이름 규칙 ──
// 앞뒤 공백 제거, 1~max자, 경로 문자(/ \)·제어 문자 금지, "." ".." 금지
export function cleanName(name, max) {
  const text = String(name ?? '').trim();
  if (!text) throw new DriveError(400, '이름을 입력해 주세요.');
  if (text.length > max) throw new DriveError(400, `이름은 ${max}자까지예요.`);
  if (/[/\\\u0000-\u001f]/.test(text) || text === '.' || text === '..') {
    throw new DriveError(400, '이름에 / \\ 같은 문자는 쓸 수 없어요.');
  }
  return text;
}

// 파일 이름 검사 (올리기·이름 바꾸기 공통): 확장자가 막힌 종류면 거절
// 끝의 점·공백은 지운다 (Windows 는 "a.exe." 를 "a.exe" 로 저장하므로 우회 방지)
export function cleanFileName(name) {
  const text = cleanName(String(name ?? '').normalize('NFC').replace(/[. ]+$/, ''), 255);
  const ext = path.extname(text).slice(1).toLowerCase();
  if (BLOCKED_EXTENSIONS.has(ext)) throw new DriveError(400, `실행 파일(.${ext})은 올리거나 이름을 바꿔 만들 수 없어요.`);
  return text;
}

// 올린 파일의 원래 이름 정리: 경로 문자(/ \)·제어 문자는 _ 로 바꾸고, 비면 "이름 없음" (맥에서는 \ 가 든 이름도 있어서 거절 대신 바꿈)
export function uploadName(original) {
  const replaced = path.basename(String(original ?? '')).replace(/[/\\\u0000-\u001f]/g, '_').trim().slice(0, 255);
  return cleanFileName(replaced.replace(/[. ]+$/, '') ? replaced : '이름 없음');
}

const cleanFolderName = (name) => cleanName(String(name ?? '').normalize('NFC'), 100);

// ── 폴더 트리 ──
// 폴더 수가 많지 않은 사내 드라이브라 한 번에 다 읽어 메모리에서 계산한다 (트리·경로·휴지통·권한 판단)
async function loadFolders(db = pool) {
  const [rows] = await db.query(
    `SELECT id, parent_id AS parentId, name, inherit_permissions AS inherit, bot_enabled AS botEnabled,
            created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt
       FROM folders`,
  );
  return new Map(rows.map((r) => [r.id, { ...r, inherit: Boolean(r.inherit), botEnabled: Boolean(r.botEnabled) }]));
}

// 폴더 + 권한을 한 번에 (요청 하나에 쿼리 2번)
async function loadContext(db = pool) {
  const [folders, perms] = await Promise.all([loadFolders(db), loadPermissions(db)]);
  return { folders, perms };
}

// 자기 자신이나 위 폴더 중 하나라도 휴지통에 있으면 숨겨진 폴더
function isHidden(map, id) {
  for (let cur = map.get(id), steps = 0; cur && steps < 1000; cur = map.get(cur.parentId), steps++) {
    if (cur.deletedAt) return true;
  }
  return !map.has(id);
}

// id 가 ancestorId 자신이거나 그 아래에 있나 (폴더를 자기 안으로 옮기는 것 막기)
function isInside(map, id, ancestorId) {
  for (let cur = map.get(id), steps = 0; cur && steps < 1000; cur = map.get(cur.parentId), steps++) {
    if (cur.id === ancestorId) return true;
  }
  return false;
}

// 이 폴더와 그 아래 모든 폴더 [{ id, depth }] (depth 0 = 이 폴더). 이미 본 폴더는 다시 안 봄 → 순환이 있어도 멈춤
function subtree(map, rootId) {
  const list = [{ id: rootId, depth: 0 }];
  const seen = new Set([rootId]);
  for (let i = 0; i < list.length; i++) {
    for (const f of map.values()) {
      if (f.parentId === list[i].id && !seen.has(f.id)) {
        seen.add(f.id);
        list.push({ id: f.id, depth: list[i].depth + 1 });
      }
    }
  }
  return list;
}

const byName = (a, b) => a.name.localeCompare(b.name, 'ko');

// 이 사람에게 보이는 폴더인가: 휴지통 아님 + 보기 이상 권한
const canSee = (user, ctx, id) => !isHidden(ctx.folders, id) && rankIn(user, id, ctx.folders, ctx.perms) > 0;

// 보이는 폴더인지 확인하고 등급까지 확인 (못 보면 404 — 있는지도 알려 주지 않음)
function requireFolder(user, ctx, id, need) {
  if (!ctx.folders.has(id) || isHidden(ctx.folders, id)) throw new DriveError(404, '폴더를 찾을 수 없어요.');
  return assertCan(user, id, need, ctx.folders, ctx.perms);
}

// 화면에 "부모"로 보여 줄 폴더: 바로 위 폴더를 볼 수 없으면 맨 위에 둔다 (공유받은 폴더)
function shownParent(user, ctx, folder) {
  return folder.parentId !== null && canSee(user, ctx, folder.parentId) ? folder.parentId : null;
}

function folderView(user, ctx, f) {
  return {
    id: f.id,
    parentId: shownParent(user, ctx, f),
    name: f.name,
    updatedAt: f.updatedAt,
    locked: !f.inherit, // 🔒 위 폴더 권한을 이어받지 않음
    level: levelName(rankIn(user, f.id, ctx.folders, ctx.perms)), // view / edit / manage
  };
}

// 같은 위치에 같은 이름 폴더가 있으면 안 됨 (휴지통에 있는 건 제외)
function assertNoSibling(map, parentId, name, exceptId = null) {
  for (const f of map.values()) {
    if (f.parentId === parentId && f.id !== exceptId && !f.deletedAt && f.name === name) {
      throw new DriveError(409, '같은 이름의 폴더가 이미 있어요.');
    }
  }
}

// 이 사람에게 보이는 폴더 전체 (화면 왼쪽 트리, 옮길 위치 고르기)
export async function getTree(user) {
  const ctx = await loadContext();
  return {
    canCreateRoot: canUseRoot(user),
    folders: [...ctx.folders.values()]
      .filter((f) => canSee(user, ctx, f.id))
      .sort(byName)
      .map((f) => folderView(user, ctx, f)),
  };
}

const FILE_COLUMNS = `
  fi.id, fi.folder_id AS folderId, fi.original_name AS name, fi.mime_type AS mimeType, fi.size_bytes AS size,
  fi.created_at AS createdAt, fi.updated_at AS updatedAt, fi.deleted_at AS deletedAt,
  u.id AS uploaderId, u.nickname AS uploaderName`;

function toFile(row) {
  const { uploaderId, uploaderName, storedName, ...rest } = row;
  return { ...rest, size: Number(rest.size), uploadedBy: uploaderId ? { id: uploaderId, nickname: uploaderName } : null };
}

// 폴더 안 내용: 경로, 하위 폴더, 파일, 내 등급. folderId 가 null 이면 맨 위 (내가 볼 수 있는 가장 위 폴더들)
export async function getContents(user, folderId) {
  const ctx = await loadContext();
  if (folderId === null) {
    const folders = [...ctx.folders.values()]
      .filter((f) => canSee(user, ctx, f.id) && shownParent(user, ctx, f) === null)
      .sort(byName)
      .map((f) => folderView(user, ctx, f));
    return { folder: null, path: [], folders, files: [], myLevel: canUseRoot(user) ? 'manage' : null, canCreateHere: canUseRoot(user) };
  }
  const rank = requireFolder(user, ctx, folderId, 'view');
  const folder = ctx.folders.get(folderId);
  // 위치 표시: 내가 볼 수 있는 위 폴더만 (못 보는 폴더 이름은 드러내지 않음)
  const path = [];
  for (let cur = folder; cur && path.length < 1000; cur = ctx.folders.get(cur.parentId)) {
    if (cur.id !== folderId && !canSee(user, ctx, cur.id)) break;
    path.unshift({ id: cur.id, name: cur.name });
  }
  const folders = [...ctx.folders.values()]
    .filter((f) => f.parentId === folderId && !f.deletedAt && canSee(user, ctx, f.id))
    .sort(byName)
    .map((f) => folderView(user, ctx, f));
  const [rows] = await pool.query(
    `SELECT ${FILE_COLUMNS} FROM files fi LEFT JOIN users u ON u.id = fi.uploaded_by
      WHERE fi.folder_id = ? AND fi.deleted_at IS NULL ORDER BY fi.original_name`,
    [folderId],
  );
  return {
    folder: { id: folderId, name: folder.name, parentId: shownParent(user, ctx, folder), locked: !folder.inherit },
    path,
    folders,
    files: rows.map(toFile),
    myLevel: levelName(rank),
    canCreateHere: rank >= rankOf('edit'),
  };
}

// 폴더 만들기: 위 폴더에 편집 권한 (맨 위는 관리자). 만든 사람은 새 폴더의 관리자가 된다 (하위 폴더 권한을 직접 정할 수 있게)
export async function createFolder(user, { parentId, name }) {
  const clean = cleanFolderName(name);
  return withLock(TREE_LOCK, async (conn) => {
    const ctx = await loadContext(conn);
    if (parentId === null) assertCanRoot(user);
    else requireFolder(user, ctx, parentId, 'edit');
    assertNoSibling(ctx.folders, parentId, clean);
    const [result] = await conn.query('INSERT INTO folders (parent_id, name, created_by) VALUES (?, ?, ?)', [parentId, clean, user.id]);
    if (!canUseRoot(user)) {
      await conn.query(
        `INSERT IGNORE INTO folder_permissions (folder_id, subject_type, user_id, subject_key, level, granted_by)
         VALUES (?, 'user', ?, ?, 'manage', ?)`,
        [result.insertId, user.id, `user:${user.id}`, user.id],
      );
    }
    return { id: result.insertId, parentId, name: clean };
  });
}

// 이름 바꾸기·옮기기: 그 폴더에 편집 권한, 옮길 곳에도 편집 권한 (맨 위로는 관리자). parentId: null = 맨 위로, undefined = 그대로
export async function updateFolder(user, id, { name, parentId }) {
  const nextNameInput = name === undefined ? undefined : cleanFolderName(name);
  return withLock(TREE_LOCK, async (conn) => {
    const ctx = await loadContext(conn);
    requireFolder(user, ctx, id, 'edit');
    const folder = ctx.folders.get(id);
    const nextName = nextNameInput ?? folder.name;
    const nextParent = parentId === undefined ? folder.parentId : parentId;
    if (nextParent !== folder.parentId) {
      if (nextParent === null) assertCanRoot(user);
      else {
        requireFolder(user, ctx, nextParent, 'edit');
        if (isInside(ctx.folders, nextParent, id)) throw new DriveError(400, '폴더를 자기 안으로 옮길 수 없어요.');
      }
    }
    assertNoSibling(ctx.folders, nextParent, nextName, id);
    await conn.query('UPDATE folders SET name = ?, parent_id = ? WHERE id = ?', [nextName, nextParent, id]);
    return { before: { name: folder.name, parentId: folder.parentId }, after: { id, name: nextName, parentId: nextParent } };
  });
}

// 휴지통으로 (이 폴더만 표시 → 아래 폴더·파일은 같이 숨겨지고, 복원하면 같이 돌아옴): 편집 권한
export async function trashFolder(user, id) {
  return withLock(TREE_LOCK, async (conn) => {
    const ctx = await loadContext(conn);
    requireFolder(user, ctx, id, 'edit');
    await conn.query('UPDATE folders SET deleted_at = NOW(), deleted_by = ? WHERE id = ?', [user.id, id]);
    return ctx.folders.get(id);
  });
}

// ── 파일 ──
async function findFileRow(id) {
  const [rows] = await pool.query(
    `SELECT ${FILE_COLUMNS}, fi.stored_name AS storedName FROM files fi LEFT JOIN users u ON u.id = fi.uploaded_by WHERE fi.id = ?`,
    [id],
  );
  return rows[0] ?? null;
}

// 보이는 파일 + 그 폴더에 need 권한 (못 보면 404)
export async function findFile(user, id, need = 'view') {
  const row = await findFileRow(id);
  const ctx = await loadContext();
  if (!row || row.deletedAt || isHidden(ctx.folders, row.folderId)) throw new DriveError(404, '파일을 찾을 수 없어요.');
  assertCan(user, row.folderId, need, ctx.folders, ctx.perms, { notFound: '파일을 찾을 수 없어요.' });
  return { ...toFile(row), storedName: row.storedName };
}

// 올리기 전 확인: 그 폴더에 편집 권한
export async function assertCanUpload(user, folderId) {
  requireFolder(user, await loadContext(), folderId, 'edit');
}

// multer 가 디스크에 저장한 파일들을 DB에 기록. 전부 성공하거나 전부 취소(트랜잭션)
// 실패하면 부른 쪽(drive.routes)이 디스크에 남은 파일을 지운다
export async function saveUploadedFiles(user, folderId, uploaded) {
  await assertCanUpload(user, folderId); // 올리는 동안 폴더가 휴지통에 갔거나 권한이 바뀌었을 수 있어서 한 번 더
  return withTx(async (conn) => {
    const saved = [];
    for (const f of uploaded) {
      const name = uploadName(f.originalname);
      const [result] = await conn.query(
        'INSERT INTO files (folder_id, original_name, stored_name, mime_type, size_bytes, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)',
        [folderId, name, f.filename, (f.mimetype || 'application/octet-stream').slice(0, 100), f.size, user.id],
      );
      saved.push({ id: result.insertId, name, size: f.size });
    }
    return saved;
  });
}

// 이름 바꾸기·옮기기: 지금 폴더에 편집 권한, 옮길 폴더에도 편집 권한
export async function updateFile(user, id, { name, folderId }) {
  const file = await findFile(user, id, 'edit');
  const nextName = name === undefined ? file.name : cleanFileName(name);
  const nextFolder = folderId === undefined ? file.folderId : folderId;
  if (nextFolder !== file.folderId) await assertCanUpload(user, nextFolder);
  await pool.query('UPDATE files SET original_name = ?, folder_id = ? WHERE id = ?', [nextName, nextFolder, id]);
  return { before: { name: file.name, folderId: file.folderId }, after: { id, name: nextName, folderId: nextFolder } };
}

export async function trashFile(user, id) {
  const file = await findFile(user, id, 'edit');
  await pool.query('UPDATE files SET deleted_at = NOW(), deleted_by = ? WHERE id = ?', [user.id, id]);
  return file;
}

// ── 휴지통 ──
// 직접 지운 것 중, 그 자리에 편집 권한이 있는 것만 보여 준다 (복원 = 편집, 영구 삭제 = 관리)
export async function listTrash(user) {
  const ctx = await loadContext();
  const rank = (folderId) => rankIn(user, folderId, ctx.folders, ctx.perms);
  const parentVisible = (parentId) => parentId === null || !isHidden(ctx.folders, parentId);
  const where = (folderId) => {
    if (folderId === null) return '드라이브';
    const names = [];
    for (let cur = ctx.folders.get(folderId); cur && names.length < 1000; cur = ctx.folders.get(cur.parentId)) names.unshift(cur.name);
    return names.join(' / ');
  };
  const [folderRows] = await pool.query(
    `SELECT f.id, f.parent_id AS parentId, f.name, f.deleted_at AS deletedAt, u.nickname AS deletedBy
       FROM folders f LEFT JOIN users u ON u.id = f.deleted_by
      WHERE f.deleted_at IS NOT NULL ORDER BY f.deleted_at DESC`,
  );
  const [fileRows] = await pool.query(
    `SELECT fi.id, fi.folder_id AS folderId, fi.original_name AS name, fi.size_bytes AS size,
            fi.deleted_at AS deletedAt, u.nickname AS deletedBy
       FROM files fi LEFT JOIN users u ON u.id = fi.deleted_by
      WHERE fi.deleted_at IS NOT NULL ORDER BY fi.deleted_at DESC`,
  );
  return {
    folders: folderRows
      .filter((f) => parentVisible(f.parentId) && rank(f.id) >= rankOf('edit'))
      .map((f) => ({ ...f, from: where(f.parentId), canPurge: rank(f.id) >= rankOf('manage') })),
    files: fileRows
      .filter((f) => !isHidden(ctx.folders, f.folderId) && rank(f.folderId) >= rankOf('edit'))
      .map((f) => ({ ...f, size: Number(f.size), from: where(f.folderId), canPurge: rank(f.folderId) >= rankOf('manage') })),
  };
}

// 휴지통 안 항목의 권한 확인 (휴지통에 있으니 "숨김" 판정 없이 권한만)
function requireInTrash(user, ctx, folderId, need) {
  return assertCan(user, folderId, need, ctx.folders, ctx.perms, { notFound: '휴지통에서 찾을 수 없어요.' });
}

export async function restoreFolder(user, id) {
  return withLock(TREE_LOCK, async (conn) => {
    const ctx = await loadContext(conn);
    const folder = ctx.folders.get(id);
    if (!folder?.deletedAt) throw new DriveError(404, '휴지통에 없는 폴더예요.');
    requireInTrash(user, ctx, id, 'edit');
    if (folder.parentId !== null && isHidden(ctx.folders, folder.parentId)) throw new DriveError(409, '위 폴더가 휴지통에 있어요. 위 폴더를 먼저 복원해 주세요.');
    try {
      assertNoSibling(ctx.folders, folder.parentId, folder.name, id);
    } catch {
      throw new DriveError(409, '같은 위치에 같은 이름의 폴더가 있어요. 그 폴더 이름을 바꾼 뒤 복원해 주세요.');
    }
    await conn.query('UPDATE folders SET deleted_at = NULL, deleted_by = NULL WHERE id = ?', [id]);
    return folder;
  });
}

export async function restoreFile(user, id) {
  const row = await findFileRow(id);
  if (!row?.deletedAt) throw new DriveError(404, '휴지통에 없는 파일이에요.');
  const ctx = await loadContext();
  requireInTrash(user, ctx, row.folderId, 'edit');
  if (isHidden(ctx.folders, row.folderId)) throw new DriveError(409, '들어 있던 폴더가 휴지통에 있어요. 폴더를 먼저 복원해 주세요.');
  await pool.query('UPDATE files SET deleted_at = NULL, deleted_by = NULL WHERE id = ?', [id]);
  return toFile(row);
}

const removeStored = (names) => Promise.all(names.map((n) => unlink(storedPath(n)).catch(() => {})));

// 영구 삭제: 휴지통에 있는 것만, 관리 권한. 폴더면 아래 폴더·파일까지 DB와 디스크에서 지운다.
// MySQL 은 CASCADE 를 15단계까지만 따라가서, 깊은 폴더도 지워지게 파일 → 가장 깊은 폴더부터 한 단계씩 직접 지운다
export async function purgeFolder(user, id) {
  const result = await withLock(TREE_LOCK, async (conn) => {
    const ctx = await loadContext(conn);
    const folder = ctx.folders.get(id);
    if (!folder?.deletedAt) throw new DriveError(404, '휴지통에 없는 폴더예요.');
    requireInTrash(user, ctx, id, 'manage');
    const tree = subtree(ctx.folders, id);
    const ids = tree.map((t) => t.id);
    const [files] = await conn.query('SELECT stored_name AS storedName FROM files WHERE folder_id IN (?)', [ids]);
    await conn.query('DELETE FROM files WHERE folder_id IN (?)', [ids]);
    const maxDepth = Math.max(...tree.map((t) => t.depth));
    for (let depth = maxDepth; depth >= 0; depth--) {
      const level = tree.filter((t) => t.depth === depth).map((t) => t.id);
      await conn.query('DELETE FROM folders WHERE id IN (?)', [level]);
    }
    return { folder, storedNames: files.map((f) => f.storedName) };
  });
  await removeStored(result.storedNames); // DB 반영이 끝난 뒤에 디스크 파일 삭제
  return { folder: result.folder, fileCount: result.storedNames.length };
}

export async function purgeFile(user, id) {
  const row = await findFileRow(id);
  if (!row?.deletedAt) throw new DriveError(404, '휴지통에 없는 파일이에요.');
  requireInTrash(user, await loadContext(), row.folderId, 'manage');
  await pool.query('DELETE FROM files WHERE id = ?', [id]);
  await removeStored([row.storedName]);
  return toFile(row);
}

// ── 권한 설정 (관리 권한) ──
// 이 폴더에 직접 준 권한 + 위에서 이어받는 권한(상속이 켜져 있을 때, 끊긴 곳까지)
function describePermissions(user, ctx, id) {
  const folder = ctx.folders.get(id);
  const inherited = [];
  if (folder.inherit) {
    for (let cur = ctx.folders.get(folder.parentId), steps = 0; cur && steps < 1000; cur = ctx.folders.get(cur.parentId), steps++) {
      const grants = (ctx.perms.get(cur.id) ?? []).map(toGrant);
      if (grants.length) inherited.push({ folderId: cur.id, folderName: cur.name, grants });
      if (!cur.inherit) break;
    }
  }
  return {
    folder: { id, name: folder.name, inherit: folder.inherit, botEnabled: folder.botEnabled, isRoot: folder.parentId === null },
    grants: (ctx.perms.get(id) ?? []).map(toGrant),
    inherited,
    myLevel: levelName(rankIn(user, id, ctx.folders, ctx.perms)),
  };
}

export async function getPermissions(user, id) {
  const ctx = await loadContext();
  requireFolder(user, ctx, id, 'manage');
  return describePermissions(user, ctx, id);
}

// 권한 통째로 바꾸기 { inherit, botEnabled, grants: [{ type, userId?, department?, level }] }
// 바꾼 결과로 내가 이 폴더 관리 권한을 잃게 되면 거절 (실수로 아무도 관리 못 하는 폴더가 생기지 않게)
export async function setPermissions(user, id, { inherit, botEnabled, grants }) {
  const list = normalizeGrants(grants);
  return withLock(TREE_LOCK, async (conn) => {
    let ctx = await loadContext(conn);
    requireFolder(user, ctx, id, 'manage');
    const folder = ctx.folders.get(id);
    await conn.query('UPDATE folders SET inherit_permissions = ?, bot_enabled = ? WHERE id = ?', [
      inherit === undefined ? folder.inherit : Boolean(inherit),
      botEnabled === undefined ? folder.botEnabled : Boolean(botEnabled),
      id,
    ]);
    await conn.query('DELETE FROM folder_permissions WHERE folder_id = ?', [id]);
    for (const g of list) {
      try {
        await conn.query(
          `INSERT INTO folder_permissions (folder_id, subject_type, user_id, department, subject_key, level, granted_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [id, g.type, g.userId, g.department, g.key, g.level, user.id],
        );
      } catch (err) {
        if (err.code === 'ER_NO_REFERENCED_ROW_2') throw new DriveError(400, g.type === 'user' ? '없는 사람이에요.' : '목록에 없는 부서예요.');
        throw err;
      }
    }
    ctx = await loadContext(conn);
    if (rankIn(user, id, ctx.folders, ctx.perms) < rankOf('manage')) {
      throw new DriveError(400, '이대로 저장하면 내 관리 권한이 없어져요. 나에게 관리 권한을 남겨 두세요.');
    }
    return describePermissions(user, ctx, id);
  });
}

// ── 활동 기록 ──
export async function logActivity(userId, action, { folderId = null, fileId = null, detail = null } = {}) {
  await pool.query('INSERT INTO file_activity (user_id, action, folder_id, file_id, detail) VALUES (?, ?, ?, ?, ?)', [
    userId,
    action,
    folderId,
    fileId,
    detail ? JSON.stringify(detail) : null,
  ]);
}
