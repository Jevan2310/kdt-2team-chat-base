import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { config } from '../../config.js';
import { DriveError } from './drive.service.js';

// 올리면 안 되는 실행 파일 (받은 사람이 실수로 실행하면 위험)
const BLOCKED_EXTENSIONS = new Set([
  'exe', 'msi', 'bat', 'cmd', 'com', 'scr', 'pif', 'ps1', 'vbs', 'vbe', 'wsf', 'jar', 'apk', 'dmg', 'pkg', 'app',
]);

mkdirSync(config.storageDir, { recursive: true });

// multer: 여러 파일을 "files" 칸으로 받아 디스크에 바로 저장 (메모리에 다 올리지 않음)
export const uploadFiles = multer({
  storage: multer.diskStorage({
    destination: config.storageDir,
    // 저장 이름은 서버가 정한 무작위 32자 (확장자 없음) → 경로 조작·이름 충돌·실행 방지
    filename: (req, file, cb) => cb(null, randomBytes(16).toString('hex')),
  }),
  defParamCharset: 'utf8', // 한글 파일 이름이 깨지지 않게
  limits: { fileSize: config.maxFileMb * 1024 * 1024, files: 20 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).slice(1).toLowerCase();
    if (BLOCKED_EXTENSIONS.has(ext)) return cb(new DriveError(400, `실행 파일(.${ext})은 올릴 수 없어요.`));
    cb(null, true);
  },
}).array('files', 20);

// multer 오류 → 사용자에게 보여 줄 문구
export function uploadErrorMessage(err) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return [413, `파일 하나는 ${config.maxFileMb}MB까지 올릴 수 있어요.`];
    if (err.code === 'LIMIT_FILE_COUNT') return [400, '한 번에 20개까지 올릴 수 있어요.'];
    return [400, '파일을 올리지 못했어요.'];
  }
  return null;
}
