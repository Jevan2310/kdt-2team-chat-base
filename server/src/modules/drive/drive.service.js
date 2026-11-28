import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { pool, withLock, withTx } from '../../db.js';
import { config } from '../../config.js';

// 드라이브에서 생기는 "사용자에게 보여 줄" 오류 (상태 코드 + 안내 문구)
export class DriveError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const storedPath = (storedName) => path.join(config.storageDir, storedName);

// 폴더 트리를 바꾸는 작업(만들기·옮기기·지우기·복원·영구 삭제)은 한 번에 하나씩 → 이름 중복·순환이 생기지 않게
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

// ── 폴더 트리 ──
// 폴더 수가 많지 않은 사내 드라이브라 한 번에 다 읽어 메모리에서 계산한다 (트리·경로·휴지통 판단)
async function loadFolders(db = pool) {
  const [rows] = await db.query(
    `SELECT id, parent_id AS parentId, name, created_at AS createdAt, updated_at AS updatedAt,
            deleted_at AS deletedAt
       FROM folders`,
  );
  return new Map(rows.map((r) => [r.id, r]));
}

// 자기 자신이나 위 폴더 중 하나라도 휴지통에 있으면 숨겨진 폴더
function isHidden(map, id) {
  for (let cur = map.get(id), steps = 0; cur && steps < 1000; cur = map.get(cur.parentId), steps++) {
    if (cur.deletedAt) return true;
  }
  return !map.has(id);
}

// 맨 위부터 이 폴더까지 [{ id, name }]
function pathOf(map, id) {
  const path = [];
  for (let cur = map.get(id); cur && path.length < 1000; cur = map.get(cur.parentId)) path.unshift({ id: cur.id, name: cur.name });
  return path;
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

async function visibleFolderOrThrow(map, id) {
  if (!map.has(id) || isHidden(map, id)) throw new DriveError(404, '폴더를 찾을 수 없어요.');
  return map.get(id);
}

// 같은 위치에 같은 이름 폴더가 있으면 안 됨 (휴지통에 있는 건 제외)
async function assertNoSibling(map, parentId, name, exceptId = null) {
  for (const f of map.values()) {
    if (f.parentId === parentId && f.id !== exceptId && !f.deletedAt && f.name === name) {
      throw new DriveError(409, '같은 이름의 폴더가 이미 있어요.');
    }
  }
}

// 보이는 폴더 전체 (화면 왼쪽 트리)
export async function getTree() {
  const map = await loadFolders();
  return [...map.values()]
    .filter((f) => !isHidden(map, f.id))
    .sort(byName)
    .map(({ id, parentId, name }) => ({ id, parentId, name }));
}

const FILE_COLUMNS = `
  fi.id, fi.folder_id AS folderId, fi.original_name AS name, fi.mime_type AS mimeType, fi.size_bytes AS size,
  fi.created_at AS createdAt, fi.updated_at AS updatedAt, fi.deleted_at AS deletedAt,
  u.id AS uploaderId, u.nickname AS uploaderName`;

function toFile(row) {
  const { uploaderId, uploaderName, ...rest } = row;
  return { ...rest, size: Number(rest.size), uploadedBy: uploaderId ? { id: uploaderId, nickname: uploaderName } : null };
}

// 폴더 안 내용: 경로, 하위 폴더, 파일. folderId 가 null 이면 맨 위 (최상위 폴더만, 파일은 폴더 안에만 둔다)
export async function getContents(folderId) {
  const map = await loadFolders();
  if (folderId !== null) await visibleFolderOrThrow(map, folderId);
  const folders = [...map.values()]
    .filter((f) => f.parentId === folderId && !f.deletedAt)
    .sort(byName)
    .map(({ id, parentId, name, updatedAt }) => ({ id, parentId, name, updatedAt }));
  let files = [];
  if (folderId !== null) {
    const [rows] = await pool.query(
      `SELECT ${FILE_COLUMNS} FROM files fi LEFT JOIN users u ON u.id = fi.uploaded_by
        WHERE fi.folder_id = ? AND fi.deleted_at IS NULL ORDER BY fi.original_name`,
      [folderId],
    );
    files = rows.map(toFile);
  }
  return {
    folder: folderId === null ? null : { id: folderId, name: map.get(folderId).name, parentId: map.get(folderId).parentId },
    path: folderId === null ? [] : pathOf(map, folderId),
    folders,
    files,
  };
}

export async function createFolder({ parentId, name, userId }) {
  const clean = cleanName(String(name ?? '').normalize('NFC'), 100);
  return withLock(TREE_LOCK, async (conn) => {
    const map = await loadFolders(conn);
    if (parentId !== null) await visibleFolderOrThrow(map, parentId);
    await assertNoSibling(map, parentId, clean);
    const [result] = await conn.query('INSERT INTO folders (parent_id, name, created_by) VALUES (?, ?, ?)', [parentId, clean, userId]);
    return { id: result.insertId, parentId, name: clean };
  });
}

// 이름 바꾸기·옮기기 (둘 중 하나 또는 둘 다). parentId: null = 맨 위로, undefined = 그대로
export async function updateFolder(id, { name, parentId }) {
  const nextNameInput = name === undefined ? undefined : cleanName(String(name).normalize('NFC'), 100);
  return withLock(TREE_LOCK, async (conn) => {
    const map = await loadFolders(conn);
    const folder = await visibleFolderOrThrow(map, id);
    const nextName = nextNameInput ?? folder.name;
    const nextParent = parentId === undefined ? folder.parentId : parentId;
    if (nextParent !== null) {
      await visibleFolderOrThrow(map, nextParent);
      if (isInside(map, nextParent, id)) throw new DriveError(400, '폴더를 자기 안으로 옮길 수 없어요.');
    }
    await assertNoSibling(map, nextParent, nextName, id);
    await conn.query('UPDATE folders SET name = ?, parent_id = ? WHERE id = ?', [nextName, nextParent, id]);
    return { before: { name: folder.name, parentId: folder.parentId }, after: { id, name: nextName, parentId: nextParent } };
  });
}

// 휴지통으로 (이 폴더만 표시 → 아래 폴더·파일은 같이 숨겨지고, 복원하면 같이 돌아옴)
export async function trashFolder(id, userId) {
  return withLock(TREE_LOCK, async (conn) => {
    const folder = await visibleFolderOrThrow(await loadFolders(conn), id);
    await conn.query('UPDATE folders SET deleted_at = NOW(), deleted_by = ? WHERE id = ?', [userId, id]);
    return folder;
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

// 보이는 파일 (휴지통 아님 + 들어 있는 폴더도 보임)
export async function findVisibleFile(id) {
  const row = await findFileRow(id);
  if (!row || row.deletedAt) throw new DriveError(404, '파일을 찾을 수 없어요.');
  const map = await loadFolders();
  if (isHidden(map, row.folderId)) throw new DriveError(404, '파일을 찾을 수 없어요.');
  return { ...toFile(row), storedName: row.storedName };
}

export async function assertFolderVisible(folderId) {
  await visibleFolderOrThrow(await loadFolders(), folderId);
}

// multer 가 디스크에 저장한 파일들을 DB에 기록. 전부 성공하거나 전부 취소(트랜잭션)
// 실패하면 부른 쪽(drive.routes)이 디스크에 남은 파일을 지운다
export async function saveUploadedFiles(folderId, uploaded, userId) {
  await assertFolderVisible(folderId); // 올리는 동안 폴더가 휴지통에 갔을 수 있어서 한 번 더
  return withTx(async (conn) => {
    const saved = [];
    for (const f of uploaded) {
      const name = uploadName(f.originalname);
      const [result] = await conn.query(
        'INSERT INTO files (folder_id, original_name, stored_name, mime_type, size_bytes, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)',
        [folderId, name, f.filename, (f.mimetype || 'application/octet-stream').slice(0, 100), f.size, userId],
      );
      saved.push({ id: result.insertId, name, size: f.size });
    }
    return saved;
  });
}

export async function updateFile(id, { name, folderId }) {
  const file = await findVisibleFile(id);
  const nextName = name === undefined ? file.name : cleanFileName(name);
  const nextFolder = folderId === undefined ? file.folderId : folderId;
  if (nextFolder !== file.folderId) await assertFolderVisible(nextFolder);
  await pool.query('UPDATE files SET original_name = ?, folder_id = ? WHERE id = ?', [nextName, nextFolder, id]);
  return { before: { name: file.name, folderId: file.folderId }, after: { id, name: nextName, folderId: nextFolder } };
}

export async function trashFile(id, userId) {
  const file = await findVisibleFile(id);
  await pool.query('UPDATE files SET deleted_at = NOW(), deleted_by = ? WHERE id = ?', [userId, id]);
  return file;
}

// ── 휴지통 ──
// 직접 지운 것만 보여 준다 (지운 폴더 안에 있던 것들은 그 폴더와 함께 움직임)
export async function listTrash() {
  const map = await loadFolders();
  const parentVisible = (parentId) => parentId === null || !isHidden(map, parentId);
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
  const where = (folderId) => (folderId === null ? '드라이브' : pathOf(map, folderId).map((p) => p.name).join(' / '));
  return {
    folders: folderRows.filter((f) => parentVisible(f.parentId)).map((f) => ({ ...f, from: where(f.parentId) })),
    files: fileRows
      .filter((f) => !isHidden(map, f.folderId))
      .map((f) => ({ ...f, size: Number(f.size), from: where(f.folderId) })),
  };
}

export async function restoreFolder(id) {
  return withLock(TREE_LOCK, async (conn) => {
    const map = await loadFolders(conn);
    const folder = map.get(id);
    if (!folder?.deletedAt) throw new DriveError(404, '휴지통에 없는 폴더예요.');
    if (folder.parentId !== null && isHidden(map, folder.parentId)) throw new DriveError(409, '위 폴더가 휴지통에 있어요. 위 폴더를 먼저 복원해 주세요.');
    await assertNoSibling(map, folder.parentId, folder.name, id).catch(() => {
      throw new DriveError(409, '같은 위치에 같은 이름의 폴더가 있어요. 그 폴더 이름을 바꾼 뒤 복원해 주세요.');
    });
    await conn.query('UPDATE folders SET deleted_at = NULL, deleted_by = NULL WHERE id = ?', [id]);
    return folder;
  });
}

export async function restoreFile(id) {
  const row = await findFileRow(id);
  if (!row?.deletedAt) throw new DriveError(404, '휴지통에 없는 파일이에요.');
  if (isHidden(await loadFolders(), row.folderId)) throw new DriveError(409, '들어 있던 폴더가 휴지통에 있어요. 폴더를 먼저 복원해 주세요.');
  await pool.query('UPDATE files SET deleted_at = NULL, deleted_by = NULL WHERE id = ?', [id]);
  return toFile(row);
}

const removeStored = (names) => Promise.all(names.map((n) => unlink(storedPath(n)).catch(() => {})));

// 영구 삭제: 휴지통에 있는 것만. 폴더면 아래 폴더·파일까지 DB와 디스크에서 지운다.
// MySQL 은 CASCADE 를 15단계까지만 따라가서, 깊은 폴더도 지워지게 파일 → 가장 깊은 폴더부터 한 단계씩 직접 지운다
export async function purgeFolder(id) {
  const result = await withLock(TREE_LOCK, async (conn) => {
    const map = await loadFolders(conn);
    const folder = map.get(id);
    if (!folder?.deletedAt) throw new DriveError(404, '휴지통에 없는 폴더예요.');
    const tree = subtree(map, id);
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

export async function purgeFile(id) {
  const row = await findFileRow(id);
  if (!row?.deletedAt) throw new DriveError(404, '휴지통에 없는 파일이에요.');
  await pool.query('DELETE FROM files WHERE id = ?', [id]);
  await removeStored([row.storedName]);
  return toFile(row);
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
