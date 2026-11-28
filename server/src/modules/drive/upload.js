import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import multer from 'multer';
import { config } from '../../config.js';
import { uploadName } from './drive.service.js';

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
  // 디스크에 쓰기 전에 이름·확장자 검사 (실행 파일이면 여기서 거절 → 저장 안 됨)
  fileFilter: (req, file, cb) => {
    try {
      uploadName(file.originalname);
      cb(null, true);
    } catch (err) {
      cb(err);
    }
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
