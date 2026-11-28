import { unlink } from 'node:fs/promises';
import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth.js';
import { getIo } from '../../socket/io.js';
import { findUserById } from '../auth/auth.service.js';
import * as drive from './drive.service.js';
import { uploadFiles, uploadErrorMessage } from './upload.js';
import { signDownload, verifyDownload, LINK_SECONDS } from './downloadLink.js';

// 공유 드라이브 API. 권한 확인은 모두 drive.service → permissions.assertCan 에서 (S1)
const router = Router();

// 드라이브가 바뀌면 접속한 모두에게 "바뀌었다"만 알림 → 각자 화면이 다시 불러옴 (자기 권한으로 볼 수 있는 것만 받음)
// (어느 폴더가 바뀌었는지는 보내지 않는다: 못 보는 폴더 정보가 새지 않게)
const changed = () => {
  try {
    getIo().emit('drive:changed', {});
  } catch {
    // 소켓이 아직 준비 전이면 알림만 건너뜀 (저장은 이미 끝남)
  }
};

// 주소의 :id → 숫자. 'root' 는 맨 위(null)
function idParam(value, { allowRoot = false } = {}) {
  if (allowRoot && value === 'root') return null;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new drive.DriveError(404, '찾을 수 없어요.');
  return id;
}
// 본문의 폴더 id: null(맨 위) / 숫자 / 없음(undefined)
function folderRef(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return idParam(value);
}

// GET /api/drive/download/:token — 서명 주소로 내려받기 (S5). 로그인 헤더 대신 60초짜리 표로 확인하므로 requireAuth 보다 위에 둔다
router.get('/download/:token', async (req, res) => {
  const { userId, fileId, inline } = verifyDownload(req.params.token);
  const user = await findUserById(userId);
  if (!user) throw new drive.DriveError(410, '잘못된 내려받기 주소예요.');
  const file = await drive.findFile(user, fileId, 'view'); // 받는 순간 권한을 다시 확인
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Cache-Control', 'private, no-store');
  const send = inline
    ? (cb) => res.sendFile(drive.storedPath(file.storedName), { headers: { 'Content-Type': file.mimeType, 'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(file.name)}` } }, cb)
    : (cb) => res.download(drive.storedPath(file.storedName), file.name, { dotfiles: 'allow' }, cb);
  send((err) => {
    if (!err) {
      // 다 보낸 뒤에만 기록
      drive.logActivity(user.id, 'download', { folderId: file.folderId, fileId: file.id, detail: { name: file.name } }).catch(console.error);
      return;
    }
    if (res.headersSent) return; // 보내는 중에 끊긴 것 (받는 쪽이 취소 등)
    if (err.code === 'ENOENT' || err.status === 404) return res.status(404).json({ message: '파일 내용이 서버에 없어요. 관리자에게 알려 주세요.' });
    console.error(err);
    res.status(500).json({ message: '파일을 보내지 못했어요.' });
  });
});

// 이 아래는 모두 로그인 필요
router.use(requireAuth);

// GET /api/drive/tree → { canCreateRoot, folders: [{ id, parentId, name, locked, level }] } (내가 볼 수 있는 폴더만)
router.get('/tree', async (req, res) => {
  res.json(await drive.getTree(req.user));
});

// GET /api/drive/folders/:id/contents  (:id = root 면 맨 위) → { folder, path, folders, files, myLevel, canCreateHere }
router.get('/folders/:id/contents', async (req, res) => {
  res.json(await drive.getContents(req.user, idParam(req.params.id, { allowRoot: true })));
});

// POST /api/drive/folders { parentId: null|id, name } → 201 { folder }  (위 폴더 편집 권한, 맨 위는 관리자)
router.post('/folders', async (req, res) => {
  const parentId = folderRef(req.body?.parentId ?? null);
  const folder = await drive.createFolder(req.user, { parentId, name: req.body?.name });
  await drive.logActivity(req.user.id, 'create_folder', { folderId: folder.id, detail: { name: folder.name } });
  changed();
  res.status(201).json({ folder });
});

// PATCH /api/drive/folders/:id { name?, parentId? } → 이름 바꾸기·옮기기 (편집 권한, 옮길 곳도 편집 권한)
router.patch('/folders/:id', async (req, res) => {
  const id = idParam(req.params.id);
  const { before, after } = await drive.updateFolder(req.user, id, { name: req.body?.name, parentId: folderRef(req.body?.parentId) });
  if (before.name !== after.name) await drive.logActivity(req.user.id, 'rename', { folderId: id, detail: { from: before.name, to: after.name } });
  if (before.parentId !== after.parentId) await drive.logActivity(req.user.id, 'move', { folderId: id, detail: { from: before.parentId, to: after.parentId } });
  changed();
  res.json({ folder: after });
});

// DELETE /api/drive/folders/:id → 휴지통으로 (편집 권한)
router.delete('/folders/:id', async (req, res) => {
  const id = idParam(req.params.id);
  const folder = await drive.trashFolder(req.user, id);
  await drive.logActivity(req.user.id, 'delete', { folderId: id, detail: { name: folder.name } });
  changed();
  res.json({ ok: true });
});

// GET /api/drive/folders/:id/permissions → { folder, grants, inherited, myLevel }  (관리 권한)
router.get('/folders/:id/permissions', async (req, res) => {
  res.json(await drive.getPermissions(req.user, idParam(req.params.id)));
});

// PUT /api/drive/folders/:id/permissions { inherit, botEnabled, grants: [{ type, userId?, department?, level }] } (관리 권한, 통째로 바꿈)
router.put('/folders/:id/permissions', async (req, res) => {
  const id = idParam(req.params.id);
  const result = await drive.setPermissions(req.user, id, req.body ?? {});
  await drive.logActivity(req.user.id, 'permission', {
    folderId: id,
    detail: { inherit: result.folder.inherit, botEnabled: result.folder.botEnabled, grants: result.grants.length },
  });
  changed();
  res.json(result);
});

// POST /api/drive/folders/:id/files  (multipart, 칸 이름 "files", 최대 20개) → 201 { files }  (편집 권한)
router.post(
  '/folders/:id/files',
  async (req, res, next) => {
    req.folderId = idParam(req.params.id); // 디스크에 저장하기 전에 폴더·권한부터 확인
    await drive.assertCanUpload(req.user, req.folderId);
    next();
  },
  uploadFiles,
  async (req, res) => {
    if (!req.files?.length) return res.status(400).json({ message: '올릴 파일을 골라 주세요.' });
    let files;
    try {
      files = await drive.saveUploadedFiles(req.user, req.folderId, req.files);
    } catch (err) {
      // DB 기록이 실패하면(폴더가 사라짐·권한이 바뀜 등) 디스크에 이미 쓴 파일도 지운다 → 주인 없는 파일이 남지 않게
      await Promise.all(req.files.map((f) => unlink(f.path).catch(() => {})));
      throw err;
    }
    for (const f of files) await drive.logActivity(req.user.id, 'upload', { folderId: req.folderId, fileId: f.id, detail: { name: f.name, size: f.size } });
    changed();
    res.status(201).json({ files });
  },
);

// POST /api/drive/files/:id/link { inline? } → { url, expiresIn }  (보기 권한) — 60초 안에 그 주소로 받으면 됨 (S5)
router.post('/files/:id/link', async (req, res) => {
  const file = await drive.findFile(req.user, idParam(req.params.id), 'view');
  const token = signDownload(req.user.id, file.id, { inline: Boolean(req.body?.inline) });
  res.json({ url: `/api/drive/download/${token}`, expiresIn: LINK_SECONDS });
});

// PATCH /api/drive/files/:id { name?, folderId? }  (편집 권한, 옮길 폴더도 편집 권한)
router.patch('/files/:id', async (req, res) => {
  const id = idParam(req.params.id);
  const folderId = req.body?.folderId === undefined ? undefined : idParam(req.body.folderId);
  const { before, after } = await drive.updateFile(req.user, id, { name: req.body?.name, folderId });
  if (before.name !== after.name) await drive.logActivity(req.user.id, 'rename', { fileId: id, folderId: after.folderId, detail: { from: before.name, to: after.name } });
  if (before.folderId !== after.folderId) await drive.logActivity(req.user.id, 'move', { fileId: id, folderId: after.folderId, detail: { from: before.folderId, to: after.folderId } });
  changed();
  res.json({ file: after });
});

// DELETE /api/drive/files/:id → 휴지통으로 (편집 권한)
router.delete('/files/:id', async (req, res) => {
  const id = idParam(req.params.id);
  const file = await drive.trashFile(req.user, id);
  await drive.logActivity(req.user.id, 'delete', { fileId: id, folderId: file.folderId, detail: { name: file.name } });
  changed();
  res.json({ ok: true });
});

// GET /api/drive/trash → { folders, files }  (그 자리에 편집 권한이 있는 것만, canPurge = 관리 권한)
router.get('/trash', async (req, res) => {
  res.json(await drive.listTrash(req.user));
});

// POST /api/drive/trash/folders/:id/restore, /trash/files/:id/restore  (편집 권한)
router.post('/trash/:kind/:id/restore', async (req, res) => {
  const id = idParam(req.params.id);
  if (req.params.kind === 'folders') {
    const folder = await drive.restoreFolder(req.user, id);
    await drive.logActivity(req.user.id, 'restore', { folderId: id, detail: { name: folder.name } });
  } else if (req.params.kind === 'files') {
    const file = await drive.restoreFile(req.user, id);
    await drive.logActivity(req.user.id, 'restore', { fileId: id, folderId: file.folderId, detail: { name: file.name } });
  } else {
    return res.status(404).json({ message: '없는 API 주소예요.' });
  }
  changed();
  res.json({ ok: true });
});

// DELETE /api/drive/trash/folders/:id, /trash/files/:id → 영구 삭제 (관리 권한, 되돌릴 수 없음)
router.delete('/trash/:kind/:id', async (req, res) => {
  const id = idParam(req.params.id);
  if (req.params.kind === 'folders') {
    const { folder, fileCount } = await drive.purgeFolder(req.user, id);
    await drive.logActivity(req.user.id, 'purge', { folderId: id, detail: { name: folder.name, fileCount } });
  } else if (req.params.kind === 'files') {
    const file = await drive.purgeFile(req.user, id);
    await drive.logActivity(req.user.id, 'purge', { fileId: id, folderId: file.folderId, detail: { name: file.name } });
  } else {
    return res.status(404).json({ message: '없는 API 주소예요.' });
  }
  changed();
  res.json({ ok: true });
});

// 이 라우터 안에서 난 오류: 드라이브 오류·업로드 오류는 안내 문구로, 나머지는 공통 오류 처리로
router.use((err, req, res, next) => {
  if (err instanceof drive.DriveError) return res.status(err.status).json({ message: err.message });
  const upload = uploadErrorMessage(err);
  if (upload) return res.status(upload[0]).json({ message: upload[1] });
  next(err);
});

export default router;
