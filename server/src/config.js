import { fileURLToPath } from 'node:url';

// 환경 변수(.env)를 한곳에서 읽는다. 값이 없으면 개발용 기본값을 쓴다.
export const config = {
  port: Number(process.env.PORT ?? 3000),
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  db: {
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'team_chat',
  },
  jwtSecret: process.env.JWT_SECRET ?? 'dev-only-secret-change-me',
  // 올린 파일(프로필 사진 등)을 저장하는 폴더: server/uploads (GitHub에 올리지 않음)
  uploadsDir: process.env.UPLOADS_DIR ?? fileURLToPath(new URL('../uploads', import.meta.url)),
  // 공유 드라이브 파일 저장 폴더: server/storage/files (GitHub에 올리지 않음, 주소로 바로 열 수 없음)
  storageDir: process.env.STORAGE_DIR ?? fileURLToPath(new URL('../storage/files', import.meta.url)),
  maxFileMb: Number(process.env.MAX_FILE_MB ?? 50), // 드라이브 파일 하나 최대 크기
};
