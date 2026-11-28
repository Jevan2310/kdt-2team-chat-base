// [편집기 시험판 A] 드라이브 파일 "내용 바꾸기" (웹 편집기에서 저장)
// 이 파일과 drive.routes.js 의 `router.use(contentRoutes)` 한 줄만 지우면 서버 쪽이 원래대로 돌아간다 (DB 변경 없음)
import { createHash, randomBytes } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { Router } from 'express';
import multer from 'multer';
import { withTx } from '../../db.js';
import { config } from '../../config.js';
import { getIo } from '../../socket/io.js';
import * as drive from './drive.service.js';

const router = Router();

// 파일 "판" 표시: 저장할 때마다 저장 이름이 새로 바뀌므로 그 이름의 해시를 판 번호처럼 쓴다
// (수정 시각은 초 단위라 1초 안에 두 번 저장하면 구분이 안 됨. 저장 이름 자체는 밖에 보이지 않게 해시만)
export const versionOf = (storedName) => createHash('sha256').update(storedName).digest('hex').slice(0, 16);

// 편집기가 만든 새 내용 1개를 "file" 칸으로 받는다. 저장 이름은 새 무작위 이름 → 다 받은 뒤에만 바꿔 끼우므로
// 저장 도중 끊겨도 원래 파일은 그대로 남는다
const uploadOne = multer({
  storage: multer.diskStorage({
    destination: config.storageDir,
    filename: (req, file, cb) => cb(null, randomBytes(16).toString('hex')),
  }),
  limits: { fileSize: config.maxFileMb * 1024 * 1024, files: 1 },
}).single('file');

// PUT /api/drive/files/:id/content (multipart: baseVersion, file) → { file: { id, size, updatedAt, version } }  (편집 권한)
// baseVersion: 편집기를 열 때 받은 판(내려받기 응답의 X-File-Version). 그사이 누가 먼저 저장했으면 409 (덮어쓰기 방지)
router.put(
  '/files/:id/content',
  async (req, res, next) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new drive.DriveError(404, '파일을 찾을 수 없어요.');
    req.fileId = id;
    await drive.findFile(req.user, id, 'edit'); // 디스크에 받기 전에 권한부터
    next();
  },
  uploadOne,
  async (req, res) => {
    if (!req.file) return res.status(400).json({ message: '저장할 내용이 없어요.' });
    let oldStored;
    let after;
    try {
      ({ oldStored, after } = await withTx(async (conn) => {
        const [[row]] = await conn.query(
          'SELECT stored_name AS storedName, updated_at AS updatedAt, deleted_at AS deletedAt FROM files WHERE id = ? FOR UPDATE',
          [req.fileId],
        );
        if (!row || row.deletedAt) throw new drive.DriveError(404, '파일을 찾을 수 없어요.');
        await drive.findFile(req.user, req.fileId, 'edit'); // 받는 동안 권한이 바뀌었을 수 있어서 한 번 더
        const base = req.body?.baseVersion;
        if (!base) throw new drive.DriveError(400, '어느 판을 고친 것인지 알 수 없어요. 다시 열어 주세요.');
        if (base !== versionOf(row.storedName)) {
          throw new drive.DriveError(409, '다른 사람이 먼저 이 파일을 저장했어요. 닫고 다시 열어 주세요.');
        }
        await conn.query('UPDATE files SET stored_name = ?, size_bytes = ?, updated_at = NOW() WHERE id = ?', [
          req.file.filename,
          req.file.size,
          req.fileId,
        ]);
        const [[next]] = await conn.query('SELECT id, size_bytes AS size, updated_at AS updatedAt, folder_id AS folderId, original_name AS name FROM files WHERE id = ?', [req.fileId]);
        return { oldStored: row.storedName, after: next };
      }));
    } catch (err) {
      await unlink(req.file.path).catch(() => {}); // 저장 실패 → 새로 받은 내용 지움 (원래 파일은 그대로)
      throw err;
    }
    // 예전 내용 지우기 (버전 기록은 시험판에 없음 — 정식으로 가면 file_versions 표로 보관)
    await unlink(drive.storedPath(oldStored)).catch(() => {});
    await drive.logActivity(req.user.id, 'edit', { fileId: after.id, folderId: after.folderId, detail: { name: after.name, size: Number(after.size) } });
    try {
      getIo().emit('drive:changed', {});
    } catch {
      // 소켓 준비 전이면 알림만 건너뜀
    }
    res.json({ file: { id: after.id, size: Number(after.size), updatedAt: after.updatedAt, version: versionOf(req.file.filename) } });
  },
);

export default router;
