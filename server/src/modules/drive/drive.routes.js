import { unlink } from 'node:fs/promises';
import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth.js';
import { getIo } from '../../socket/io.js';
import * as drive from './drive.service.js';
import { uploadFiles, uploadErrorMessage } from './upload.js';

// 공유 드라이브 API (9단계: 로그인한 사람 모두 사용. 폴더별 권한은 10단계에서 여기에 끼워 넣는다)
const router = Router();
router.use(requireAuth);

// 드라이브가 바뀌면 접속한 모두에게 알림 → 그 폴더를 보고 있는 화면이 다시 불러옴
const changed = (...folderIds) => {
  try {
    getIo().emit('drive:changed', { folderIds: folderIds.filter((id) => id !== undefined) });
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

// GET /api/drive/tree → { folders: [{ id, parentId, name }] }
router.get('/tree', async (req, res) => {
  res.json({ folders: await drive.getTree() });
});

// GET /api/drive/folders/:id/contents  (:id = root 면 맨 위) → { folder, path, folders, files }
router.get('/folders/:id/contents', async (req, res) => {
  res.json(await drive.getContents(idParam(req.params.id, { allowRoot: true })));
});

// POST /api/drive/folders { parentId: null|id, name } → 201 { folder }
router.post('/folders', async (req, res) => {
  const parentId = folderRef(req.body?.parentId ?? null);
  const folder = await drive.createFolder({ parentId, name: req.body?.name, userId: req.user.id });
  await drive.logActivity(req.user.id, 'create_folder', { folderId: folder.id, detail: { name: folder.name } });
  changed(parentId);
  res.status(201).json({ folder });
});

// PATCH /api/drive/folders/:id { name?, parentId? } → 이름 바꾸기·옮기기
router.patch('/folders/:id', async (req, res) => {
  const id = idParam(req.params.id);
  const { before, after } = await drive.updateFolder(id, { name: req.body?.name, parentId: folderRef(req.body?.parentId) });
  if (before.name !== after.name) await drive.logActivity(req.user.id, 'rename', { folderId: id, detail: { from: before.name, to: after.name } });
  if (before.parentId !== after.parentId) await drive.logActivity(req.user.id, 'move', { folderId: id, detail: { from: before.parentId, to: after.parentId } });
  changed(before.parentId, after.parentId, id);
  res.json({ folder: after });
});

// DELETE /api/drive/folders/:id → 휴지통으로
router.delete('/folders/:id', async (req, res) => {
  const id = idParam(req.params.id);
  const folder = await drive.trashFolder(id, req.user.id);
  await drive.logActivity(req.user.id, 'delete', { folderId: id, detail: { name: folder.name } });
  changed(folder.parentId, id);
  res.json({ ok: true });
});

// POST /api/drive/folders/:id/files  (multipart, 칸 이름 "files", 최대 20개) → 201 { files }
router.post(
  '/folders/:id/files',
  async (req, res, next) => {
    req.folderId = idParam(req.params.id); // 디스크에 저장하기 전에 폴더부터 확인
    await drive.assertFolderVisible(req.folderId);
    next();
  },
  uploadFiles,
  async (req, res) => {
    if (!req.files?.length) return res.status(400).json({ message: '올릴 파일을 골라 주세요.' });
    let files;
    try {
      files = await drive.saveUploadedFiles(req.folderId, req.files, req.user.id);
    } catch (err) {
      // DB 기록이 실패하면(폴더가 사라짐 등) 디스크에 이미 쓴 파일도 지운다 → 주인 없는 파일이 남지 않게
      await Promise.all(req.files.map((f) => unlink(f.path).catch(() => {})));
      throw err;
    }
    for (const f of files) await drive.logActivity(req.user.id, 'upload', { folderId: req.folderId, fileId: f.id, detail: { name: f.name, size: f.size } });
    changed(req.folderId);
    res.status(201).json({ files });
  },
);

// GET /api/drive/files/:id/download → 파일 (항상 "내려받기"로, 브라우저가 열어서 실행하지 않게)
router.get('/files/:id/download', async (req, res) => {
  const file = await drive.findVisibleFile(idParam(req.params.id));
  res.set('X-Content-Type-Options', 'nosniff');
  res.download(drive.storedPath(file.storedName), file.name, { dotfiles: 'allow' }, (err) => {
    if (!err) {
      // 다 보낸 뒤에만 기록
      drive.logActivity(req.user.id, 'download', { folderId: file.folderId, fileId: file.id, detail: { name: file.name } }).catch(console.error);
      return;
    }
    if (res.headersSent) return; // 보내는 중에 끊긴 것 (받는 쪽이 취소 등)
    if (err.code === 'ENOENT' || err.status === 404) return res.status(404).json({ message: '파일 내용이 서버에 없어요. 관리자에게 알려 주세요.' });
    console.error(err);
    res.status(500).json({ message: '파일을 보내지 못했어요.' });
  });
});

// PATCH /api/drive/files/:id { name?, folderId? }
router.patch('/files/:id', async (req, res) => {
  const id = idParam(req.params.id);
  const folderId = req.body?.folderId === undefined ? undefined : idParam(req.body.folderId);
  const { before, after } = await drive.updateFile(id, { name: req.body?.name, folderId });
  if (before.name !== after.name) await drive.logActivity(req.user.id, 'rename', { fileId: id, folderId: after.folderId, detail: { from: before.name, to: after.name } });
  if (before.folderId !== after.folderId) await drive.logActivity(req.user.id, 'move', { fileId: id, folderId: after.folderId, detail: { from: before.folderId, to: after.folderId } });
  changed(before.folderId, after.folderId);
  res.json({ file: after });
});

// DELETE /api/drive/files/:id → 휴지통으로
router.delete('/files/:id', async (req, res) => {
  const id = idParam(req.params.id);
  const file = await drive.trashFile(id, req.user.id);
  await drive.logActivity(req.user.id, 'delete', { fileId: id, folderId: file.folderId, detail: { name: file.name } });
  changed(file.folderId);
  res.json({ ok: true });
});

// GET /api/drive/trash → { folders, files }
router.get('/trash', async (req, res) => {
  res.json(await drive.listTrash());
});

// POST /api/drive/trash/folders/:id/restore, /trash/files/:id/restore
router.post('/trash/:kind/:id/restore', async (req, res) => {
  const id = idParam(req.params.id);
  if (req.params.kind === 'folders') {
    const folder = await drive.restoreFolder(id);
    await drive.logActivity(req.user.id, 'restore', { folderId: id, detail: { name: folder.name } });
    changed(folder.parentId, id);
  } else if (req.params.kind === 'files') {
    const file = await drive.restoreFile(id);
    await drive.logActivity(req.user.id, 'restore', { fileId: id, folderId: file.folderId, detail: { name: file.name } });
    changed(file.folderId);
  } else {
    return res.status(404).json({ message: '없는 API 주소예요.' });
  }
  res.json({ ok: true });
});

// DELETE /api/drive/trash/folders/:id, /trash/files/:id → 영구 삭제 (되돌릴 수 없음)
router.delete('/trash/:kind/:id', async (req, res) => {
  const id = idParam(req.params.id);
  if (req.params.kind === 'folders') {
    const { folder, fileCount } = await drive.purgeFolder(id);
    await drive.logActivity(req.user.id, 'purge', { folderId: id, detail: { name: folder.name, fileCount } });
  } else if (req.params.kind === 'files') {
    const file = await drive.purgeFile(id);
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
